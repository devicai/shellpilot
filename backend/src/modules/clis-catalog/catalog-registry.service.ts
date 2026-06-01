import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import { CONFIG } from '../../config/config.loader';
import { ShellpilotModuleConfig } from '../../config/config.types';
import { RedisService } from '../../redis/redis.service';
import { ExtensionScope } from '../../interfaces';
import { ClisRepository } from './clis.repository';
import { ClisImportExportService } from './import-export.service';
import { Cli, CliSource } from './schema/cli.schema';

const CACHE_PREFIX = 'shellpilot:catalog:';

// Registry-only meta fields carried in the catalog YAML that are NOT part of
// the Cli schema. Stripped before validation; `version` is tracked in
// Cli.source instead.
const REGISTRY_META_FIELDS = ['version', 'category'];

// One line in catalog/index.yml.
export interface RegistryIndexEntry {
  slug: string;
  name: string;
  description?: string;
  category?: string;
  iconUrl?: string;
  version: number;
}

// An index entry annotated with the requesting scope's import status.
export interface RegistryListItem extends RegistryIndexEntry {
  imported: boolean;
  importedVersion?: number;
  updateAvailable: boolean;
}

// Full preview of a catalog entry: the validated Cli shape (install snippet,
// auth/delivery) plus its registry meta and upstream sha.
export interface RegistryEntryDetail {
  meta: RegistryIndexEntry;
  cli: Partial<Cli>;
  sha?: string;
}

export interface CatalogUpdate {
  slug: string;
  name: string;
  importedVersion: number;
  availableVersion: number;
}

@Injectable()
export class CatalogRegistryService {
  private readonly logger = new Logger(CatalogRegistryService.name);

  constructor(
    @Inject(CONFIG) private readonly config: ShellpilotModuleConfig,
    private readonly redis: RedisService,
    private readonly repo: ClisRepository,
    private readonly importExport: ClisImportExportService,
  ) {}

  /** Browse the catalog, annotated with this scope's import/update status. */
  async getRegistry(scope: ExtensionScope): Promise<RegistryListItem[]> {
    const [index, imported] = await Promise.all([this.getIndex(), this.loadImportedVersions(scope)]);
    return index.map((e) => {
      const importedVersion = imported.get(e.slug);
      return {
        ...e,
        imported: importedVersion !== undefined,
        importedVersion,
        updateAvailable: importedVersion !== undefined && e.version > importedVersion,
      };
    });
  }

  /** Imported registry entries that have a newer version available upstream. */
  async getUpdates(scope: ExtensionScope): Promise<CatalogUpdate[]> {
    const list = await this.getRegistry(scope);
    return list
      .filter((e) => e.updateAvailable)
      .map((e) => ({
        slug: e.slug,
        name: e.name,
        importedVersion: e.importedVersion as number,
        availableVersion: e.version,
      }));
  }

  /** Fetch + validate a single entry for preview (does not write anything). */
  async getEntry(slug: string): Promise<RegistryEntryDetail> {
    const meta = await this.requireIndexEntry(slug);
    const { content, sha } = await this.fetchRaw(`clis/${meta.slug}.yml`);
    let parsed: unknown;
    try {
      parsed = yaml.load(content);
    } catch (err) {
      throw new BadGatewayException(`invalid catalog entry ${meta.slug}.yml: ${(err as Error).message}`);
    }
    const cli = this.importExport.validateEntry(this.stripMeta(parsed));
    return { meta, cli, sha };
  }

  /** Fetch, validate, and upsert an entry into the DB with provenance. */
  async importEntry(
    slug: string,
    overwrite: boolean,
    scope: ExtensionScope,
  ): Promise<{ action: 'created' | 'updated'; slug: string; version: number }> {
    const detail = await this.getEntry(slug);
    const slugLc = detail.meta.slug;
    const cfg = this.config.catalog;

    const source: CliSource = {
      origin: 'registry',
      repo: cfg.repo,
      ref: cfg.source === 'github' ? cfg.ref : 'local',
      path: `${cfg.path}/clis/${slugLc}.yml`,
      version: detail.meta.version,
      sha: detail.sha,
      importedAt: new Date(),
    };
    const payload: Partial<Cli> = { ...detail.cli, source };

    const existing = await this.repo.findBySlug(slugLc, scope);
    if (existing && !overwrite) {
      throw new ConflictException(`'${slugLc}' already exists — pass overwrite=true to update it`);
    }
    if (existing) {
      await this.repo.updateById(
        (existing as unknown as { _id: { toString(): string } })._id.toString(),
        payload,
        scope,
      );
      return { action: 'updated', slug: slugLc, version: detail.meta.version };
    }
    await this.repo.create(payload, scope);
    return { action: 'created', slug: slugLc, version: detail.meta.version };
  }

  // --- internals -----------------------------------------------------------

  /** Parse + validate catalog/index.yml into a list of entries. */
  async getIndex(): Promise<RegistryIndexEntry[]> {
    const { content } = await this.fetchRaw('index.yml');
    let parsed: unknown;
    try {
      parsed = yaml.load(content);
    } catch (err) {
      throw new BadGatewayException(`invalid catalog index.yml: ${(err as Error).message}`);
    }
    const list = Array.isArray(parsed)
      ? parsed
      : (parsed as { clis?: unknown })?.clis;
    if (!Array.isArray(list)) {
      throw new BadGatewayException('catalog index.yml must be a list or an object with a `clis:` list');
    }
    return list.map((e) => this.normalizeIndexEntry(e));
  }

  private async requireIndexEntry(slug: string): Promise<RegistryIndexEntry> {
    const index = await this.getIndex();
    const meta = index.find((e) => e.slug === slug.toLowerCase());
    if (!meta) {
      throw new NotFoundException(`'${slug}' is not in the catalog index`);
    }
    return meta;
  }

  private normalizeIndexEntry(raw: unknown): RegistryIndexEntry {
    if (!raw || typeof raw !== 'object') {
      throw new BadGatewayException('each index entry must be an object');
    }
    const o = raw as Record<string, unknown>;
    if (typeof o.slug !== 'string' || !o.slug.trim()) {
      throw new BadGatewayException('index entry missing slug');
    }
    if (typeof o.name !== 'string' || !o.name.trim()) {
      throw new BadGatewayException(`index entry ${o.slug}: missing name`);
    }
    const version = typeof o.version === 'number' ? o.version : Number(o.version);
    if (!Number.isFinite(version)) {
      throw new BadGatewayException(`index entry ${o.slug}: version must be a number`);
    }
    return {
      slug: o.slug.toLowerCase(),
      name: o.name,
      description: typeof o.description === 'string' ? o.description : undefined,
      category: typeof o.category === 'string' ? o.category : undefined,
      iconUrl: typeof o.iconUrl === 'string' ? o.iconUrl : undefined,
      version,
    };
  }

  /** Map of slug → imported source.version for registry-origin entries. */
  private async loadImportedVersions(scope: ExtensionScope): Promise<Map<string, number>> {
    const page = await this.repo.find({ 'source.origin': 'registry' }, scope, { limit: 1000, offset: 0 });
    const map = new Map<string, number>();
    for (const doc of page.data) {
      const c = (doc as unknown as { toObject?: () => Record<string, unknown> }).toObject?.() ?? doc;
      const slug = (c as { slug?: string }).slug;
      const version = (c as { source?: { version?: number } }).source?.version;
      if (slug && typeof version === 'number') map.set(slug, version);
    }
    return map;
  }

  private stripMeta(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const clone = { ...(raw as Record<string, unknown>) };
    for (const k of REGISTRY_META_FIELDS) delete clone[k];
    return clone;
  }

  /**
   * Fetch a file relative to the catalog path from the configured source.
   * github: GitHub Contents API (with token if private), cached in Redis.
   * local: read from disk (no cache needed).
   */
  private async fetchRaw(relativePath: string): Promise<{ content: string; sha?: string }> {
    const cfg = this.config.catalog;

    if (cfg.source === 'local') {
      const full = join(cfg.repo, cfg.path, relativePath);
      if (!existsSync(full)) {
        throw new NotFoundException(`catalog file not found: ${relativePath} (looked in ${full})`);
      }
      return { content: readFileSync(full, 'utf-8') };
    }

    const fullPath = `${cfg.path}/${relativePath}`.replace(/\/{2,}/g, '/');
    const cacheKey = `${CACHE_PREFIX}${cfg.repo}:${cfg.ref}:${fullPath}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as { content: string; sha?: string };

    const url = `https://api.github.com/repos/${cfg.repo}/contents/${fullPath}?ref=${encodeURIComponent(cfg.ref)}`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'shellpilot-catalog',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;

    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      throw new BadGatewayException(`catalog registry unreachable: ${(err as Error).message}`);
    }
    if (res.status === 404) {
      throw new NotFoundException(`catalog file not found upstream: ${relativePath}`);
    }
    if (!res.ok) {
      this.logger.warn(`registry fetch ${url} -> ${res.status}`);
      throw new BadGatewayException(`catalog registry fetch failed (HTTP ${res.status})`);
    }
    const json = (await res.json()) as { content?: string; encoding?: string; sha?: string };
    if (!json.content) {
      throw new BadGatewayException('catalog registry response missing file content');
    }
    const content = Buffer.from(json.content, (json.encoding as BufferEncoding) || 'base64').toString('utf-8');
    const result = { content, sha: json.sha };
    await this.redis.set(cacheKey, JSON.stringify(result), cfg.cacheTtlSeconds);
    return result;
  }
}
