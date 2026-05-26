import { BadRequestException, Injectable } from '@nestjs/common';
import * as yaml from 'js-yaml';
import { ClisRepository } from './clis.repository';
import { CLI_AUTH_MODES, CLI_ENFORCEMENT, Cli } from './schema/cli.schema';
import { ExtensionScope } from '../../interfaces';

// Shape of a single CLI in the catalog YAML. Mirrors the schema's writable
// fields. Unknown fields are rejected so users get a fast error instead of
// silently losing config typos.
const ALLOWED_FIELDS = new Set([
  'slug',
  'name',
  'vendor',
  'description',
  'auth',
  'defaultEnforcement',
  'installCommands',
  'docsUrl',
  'icon',
  'iconUrl',
  'active',
]);

export interface ImportSummary {
  created: string[];
  updated: string[];
  skipped: Array<{ slug: string; reason: string }>;
  errors: Array<{ slug?: string; reason: string }>;
}

@Injectable()
export class ClisImportExportService {
  constructor(private readonly repo: ClisRepository) {}

  /**
   * Parse a YAML doc and upsert (by slug) into the catalog. Accepts either a
   * top-level array (`- slug: ...`) or an object wrapping `clis: [...]` — both
   * shapes are common in shared CLI-definitions repos.
   *
   * `overwrite=false` (default) skips slugs that already exist; `overwrite=true`
   * replaces the existing entry's fields with the new values (partial update).
   */
  async importYaml(
    yamlText: string,
    opts: { overwrite?: boolean },
    scope: ExtensionScope,
  ): Promise<ImportSummary> {
    let parsed: unknown;
    try {
      parsed = yaml.load(yamlText);
    } catch (err) {
      throw new BadRequestException(`Invalid YAML: ${(err as Error).message}`);
    }
    const entries = this.coerceEntries(parsed);

    const summary: ImportSummary = { created: [], updated: [], skipped: [], errors: [] };

    for (const raw of entries) {
      try {
        const cli = this.normalizeEntry(raw);
        const slug = cli.slug as string; // normalizeEntry guarantees presence
        const existing = await this.repo.findBySlug(slug);
        if (existing && !opts.overwrite) {
          summary.skipped.push({ slug, reason: 'already exists (use overwrite=true)' });
          continue;
        }
        if (existing) {
          await this.repo.updateById(
            (existing as unknown as { _id: { toString(): string } })._id.toString(),
            cli,
            scope,
          );
          summary.updated.push(slug);
        } else {
          await this.repo.create(cli, scope);
          summary.created.push(slug);
        }
      } catch (err) {
        const slug = typeof (raw as { slug?: unknown })?.slug === 'string' ? (raw as { slug: string }).slug : undefined;
        summary.errors.push({ slug, reason: (err as Error).message });
      }
    }
    return summary;
  }

  /**
   * Dump the active catalog as YAML. Excludes the Mongo-internal fields (_id,
   * timestamps) and any field the schema wouldn't accept back in importYaml,
   * so the dump round-trips cleanly through the import endpoint.
   */
  async exportYaml(scope: ExtensionScope): Promise<string> {
    // Use a large page size; admins typically have <100 CLIs total.
    const page = await this.repo.find({}, scope, { limit: 1000, offset: 0, sort: { slug: 1 } });
    const clis = page.data.map((doc) => this.serialise(doc));
    return yaml.dump({ clis }, { lineWidth: 120, noRefs: true, sortKeys: false });
  }

  /**
   * Validate+normalise a single raw entry (one parsed YAML object) into the
   * writable Cli shape. Public so the catalog-registry import path can reuse the
   * exact same validation the bulk YAML import uses. Throws BadRequestException
   * on any invalid/unknown field.
   */
  validateEntry(raw: unknown): Partial<Cli> {
    return this.normalizeEntry(raw);
  }

  private coerceEntries(doc: unknown): unknown[] {
    if (Array.isArray(doc)) return doc;
    if (doc && typeof doc === 'object' && Array.isArray((doc as { clis?: unknown }).clis)) {
      return (doc as { clis: unknown[] }).clis;
    }
    throw new BadRequestException('YAML must be a list of CLIs or an object with a `clis:` list');
  }

  private normalizeEntry(raw: unknown): Partial<Cli> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException('each CLI entry must be an object');
    }
    const obj = raw as Record<string, unknown>;
    const extras = Object.keys(obj).filter((k) => !ALLOWED_FIELDS.has(k));
    if (extras.length) {
      throw new BadRequestException(`unknown fields: ${extras.join(', ')}`);
    }
    if (typeof obj.slug !== 'string' || !obj.slug.trim()) {
      throw new BadRequestException('slug is required');
    }
    if (typeof obj.name !== 'string' || !obj.name.trim()) {
      throw new BadRequestException(`slug=${obj.slug}: name is required`);
    }
    const out: Partial<Cli> = {
      slug: obj.slug.toLowerCase(),
      name: obj.name,
    };
    if (typeof obj.vendor === 'string') out.vendor = obj.vendor;
    if (typeof obj.description === 'string') out.description = obj.description;
    if (typeof obj.docsUrl === 'string') out.docsUrl = obj.docsUrl;
    if (typeof obj.icon === 'string') out.icon = obj.icon;
    if (typeof obj.iconUrl === 'string') out.iconUrl = obj.iconUrl;
    if (typeof obj.active === 'boolean') out.active = obj.active;

    if (obj.defaultEnforcement !== undefined) {
      if (!CLI_ENFORCEMENT.includes(obj.defaultEnforcement as never)) {
        throw new BadRequestException(
          `slug=${obj.slug}: defaultEnforcement must be one of ${CLI_ENFORCEMENT.join(', ')}`,
        );
      }
      out.defaultEnforcement = obj.defaultEnforcement as (typeof CLI_ENFORCEMENT)[number];
    }

    if (obj.installCommands !== undefined) {
      if (typeof obj.installCommands !== 'object' || obj.installCommands === null) {
        throw new BadRequestException(`slug=${obj.slug}: installCommands must be an object`);
      }
      out.installCommands = obj.installCommands as Cli['installCommands'];
    }

    if (obj.auth !== undefined) {
      out.auth = this.normalizeAuth(obj.auth, obj.slug);
    }

    return out;
  }

  private normalizeAuth(rawAuth: unknown, slug: string): Cli['auth'] {
    if (!rawAuth || typeof rawAuth !== 'object' || Array.isArray(rawAuth)) {
      throw new BadRequestException(`slug=${slug}: auth must be an object`);
    }
    const a = rawAuth as Record<string, unknown>;
    if (a.mode !== undefined && !CLI_AUTH_MODES.includes(a.mode as never)) {
      throw new BadRequestException(
        `slug=${slug}: auth.mode must be one of ${CLI_AUTH_MODES.join(', ')}`,
      );
    }
    // Trust the rest of the auth shape — postProcess/delivery are intentionally
    // opaque maps so new primitives can land via config alone. The catalog
    // schema is Mixed for those arrays; runtime validation lives in the
    // executors (path-resolver / http-form-post / etc.).
    return rawAuth as Cli['auth'];
  }

  private serialise(doc: unknown): Record<string, unknown> {
    const c = doc as Record<string, unknown> & {
      toObject?: () => Record<string, unknown>;
    };
    const plain = typeof c.toObject === 'function' ? c.toObject() : c;
    const out: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (plain[key] !== undefined && plain[key] !== null) {
        out[key] = plain[key];
      }
    }
    return out;
  }
}
