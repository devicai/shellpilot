import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CredentialsRepository } from './credentials.repository';
import { SecretCipherService } from './crypto/secret-cipher.service';
import { JitTokenService, VaultEnvelope } from './jit/jit-token.service';
import { VaultEntry } from './schema/vault-entry.schema';
import { StoreCredentialDto } from './dto/store-credential.dto';
import { IssueCredentialDto } from './dto/issue-credential.dto';
import { VerifyCredentialDto } from './dto/verify-credential.dto';
import { ClisService } from '../clis-catalog/clis.service';
import { CliAuthMode, OsPath } from '../clis-catalog/schema/cli.schema';
import { PostProcessService } from './post-process/post-process.service';
import { TracesService } from '../traces/traces.service';
import { UsersRepository } from '../users/users.repository';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { AuthenticatedUser, ExtensionScope, PaginatedResponse } from '../../interfaces';

export interface JitVerifyResponse {
  cli: string;
  userId: string;
  mode: CliAuthMode;
  envVar?: string;
  envVars?: string[];
  secret?: string;
  values?: Record<string, string>;
  filePath?: OsPath;
  fileFormat?: string;
  content?: string;
  flag?: string;
  // Derived server-side from the CLI's auth.postProcess at verify time.
  extras?: Record<string, unknown>;
  // The catalog's auth.delivery snapshot — the wrapper applies these client-side.
  delivery?: Array<Record<string, unknown>>;
}

@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);

  constructor(
    private readonly repo: CredentialsRepository,
    private readonly cipher: SecretCipherService,
    private readonly jit: JitTokenService,
    private readonly clis: ClisService,
    private readonly postProcess: PostProcessService,
    private readonly traces: TracesService,
    private readonly users: UsersRepository,
    private readonly profiles: ProfilesRepository,
  ) {}

  async store(
    dto: StoreCredentialDto,
    actor: AuthenticatedUser,
    scope: ExtensionScope,
  ): Promise<VaultEntry> {
    let ownerId = actor.id;
    if (dto.userId && dto.userId !== actor.id) {
      if (actor.role !== 'admin') {
        throw new ForbiddenException('Only admins can store credentials for other users');
      }
      ownerId = dto.userId;
    }

    const cli = await this.clis.findOne(dto.cli, scope);
    const auth = cli.auth ?? { mode: 'env' as CliAuthMode };
    const envelope = this.normalizeEnvelope(auth.mode, dto.payload);
    const sealed = this.cipher.seal(JSON.stringify(envelope));

    return this.repo.upsertForUserAndCli(ownerId, cli.slug, {
      mode: auth.mode,
      envVar: auth.envVar,
      envVars: auth.envVars,
      filePath: auth.filePath,
      fileFormat: auth.fileFormat,
      flag: auth.flag,
      envelopeCiphertext: sealed.ciphertext,
      envelopeIv: sealed.iv,
      envelopeTag: sealed.tag,
    });
  }

  private normalizeEnvelope(
    mode: CliAuthMode,
    payload: Record<string, unknown> | undefined,
  ): VaultEnvelope {
    const p = payload ?? {};
    switch (mode) {
      case 'env':
      case 'flag': {
        if (typeof p.secret !== 'string' || !p.secret) {
          throw new BadRequestException(`mode=${mode} requires payload.secret`);
        }
        this.rejectUnknownKeys(mode, p, ['secret']);
        return { secret: p.secret };
      }
      case 'env-multi': {
        const v = p.values;
        if (!v || typeof v !== 'object' || Array.isArray(v)) {
          throw new BadRequestException('mode=env-multi requires payload.values as a string map');
        }
        const values: Record<string, string> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          if (typeof val !== 'string' || !val) {
            throw new BadRequestException(`payload.values.${k} must be a non-empty string`);
          }
          values[k] = val;
        }
        this.rejectUnknownKeys(mode, p, ['values']);
        return { values };
      }
      case 'file': {
        if (typeof p.content !== 'string' || !p.content) {
          throw new BadRequestException('mode=file requires payload.content');
        }
        this.rejectUnknownKeys(mode, p, ['content']);
        return { content: p.content };
      }
      case 'login-command':
      case 'none':
        throw new BadRequestException(`mode=${mode} does not accept stored credentials`);
    }
  }

  // Refuse extra payload keys instead of silently ignoring them — protects
  // against accidental cross-mode payloads (e.g. a user sending {secret,
  // values} for mode=env, where the dangling `values` would otherwise be
  // dropped without warning).
  private rejectUnknownKeys(mode: CliAuthMode, payload: Record<string, unknown>, allowed: string[]): void {
    const extras = Object.keys(payload).filter((k) => !allowed.includes(k));
    if (extras.length > 0) {
      throw new BadRequestException(
        `mode=${mode} does not accept payload keys: ${extras.join(', ')} (allowed: ${allowed.join(', ')})`,
      );
    }
  }

  async list(
    actor: AuthenticatedUser,
    scope: ExtensionScope,
    opts: { limit?: number; offset?: number },
  ): Promise<PaginatedResponse<VaultEntry>> {
    if (actor.role === 'admin') {
      return this.repo.find({}, scope, opts);
    }
    return this.repo.find({ userId: new Types.ObjectId(actor.id) }, scope, opts);
  }

  async delete(id: string, actor: AuthenticatedUser, scope: ExtensionScope): Promise<void> {
    const existing = (await this.repo.findById(id, scope)) as
      | (VaultEntry & { userId: Types.ObjectId })
      | null;
    if (!existing) throw new NotFoundException('Credential not found');
    if (actor.role !== 'admin' && String(existing.userId) !== actor.id) {
      throw new ForbiddenException();
    }
    await this.repo.deleteById(id, scope);
  }

  async issue(dto: IssueCredentialDto): Promise<{ jitToken: string; expiresIn: number }> {
    // Profile gate: if the user has a profile assigned and it whitelists CLIs,
    // refuse early when the requested cli isn't in the list. Department
    // boundaries: a marketing user shouldn't be able to issue gcloud creds
    // even if a vault entry exists for them. The wrapper turns this into a
    // policy-deny equivalent at the call site.
    const user = (await this.users.findById(dto.userId, {})) as
      | { profileId?: { toString(): string } }
      | null;
    if (user?.profileId) {
      const profile = await this.profiles.findById(user.profileId.toString(), {});
      if (profile && profile.clis && profile.clis.length > 0) {
        const allowed = profile.clis.map((s) => s.toLowerCase());
        if (!allowed.includes(dto.cli.toLowerCase())) {
          throw new ForbiddenException(
            `CLI '${dto.cli}' is not allowed by the user's profile`,
          );
        }
      }
    }

    const entry = await this.repo.findForUserAndCli(dto.userId, dto.cli);
    if (!entry) {
      throw new NotFoundException(
        `No credential stored for user ${dto.userId} and CLI ${dto.cli}`,
      );
    }
    const envelope = JSON.parse(
      this.cipher.open({
        ciphertext: entry.envelopeCiphertext,
        iv: entry.envelopeIv,
        tag: entry.envelopeTag,
      }),
    ) as VaultEnvelope;

    // Snapshot the catalog's current auth config into the JIT — the catalog is
    // the source of truth for delivery shape (filePath, mode, flag, env names),
    // not the VaultEntry, so an admin updating the entry takes effect on next
    // command. The VaultEntry's snapshot is kept for /credentials list display.
    const cli = await this.clis.findOne(dto.cli, {} as ExtensionScope);
    const auth = cli.auth ?? { mode: entry.mode };

    const issued = await this.jit.issue({
      userId: dto.userId,
      cli: dto.cli,
      mode: auth.mode ?? entry.mode,
      envVar: auth.envVar ?? entry.envVar,
      envVars: auth.envVars ?? entry.envVars,
      filePath: auth.filePath ?? entry.filePath,
      fileFormat: auth.fileFormat ?? entry.fileFormat,
      flag: auth.flag ?? entry.flag,
      envelope,
      postProcess: auth.postProcess as Array<Record<string, unknown>> | undefined,
      delivery: auth.delivery as Array<Record<string, unknown>> | undefined,
      commandPath: dto.commandPath,
    });

    // Trace the JIT issuance so operators see who is fetching which credential
    // independently of whether the wrapper later posts an exec trace. Failure
    // here is non-fatal — issuance succeeded and we don't want a trace hiccup
    // to mask a working credential flow.
    try {
      await this.traces.ingest({
        cli: dto.cli,
        commandPath: dto.commandPath ?? [],
        decision: 'jit-issued',
        userId: dto.userId,
        agent: 'shellpilot-backend',
      });
    } catch (err) {
      this.logger.warn(
        `Failed to emit jit-issued trace for user=${dto.userId} cli=${dto.cli}: ${(err as Error).message}`,
      );
    }

    return issued;
  }

  async verify(dto: VerifyCredentialDto): Promise<JitVerifyResponse> {
    const payload = await this.jit.consume(dto.jitToken);
    if (!payload) {
      throw new NotFoundException('JIT token not found or already consumed');
    }
    if (dto.expectedCommandPath && payload.commandPath) {
      const expected = dto.expectedCommandPath.join(' ');
      const stored = payload.commandPath.join(' ');
      if (expected !== stored) {
        throw new ForbiddenException('Command path mismatch for JIT token');
      }
    }

    const out: JitVerifyResponse = {
      cli: payload.cli,
      userId: payload.userId,
      mode: payload.mode,
    };
    switch (payload.mode) {
      case 'env':
        out.envVar = payload.envVar;
        out.secret = payload.envelope.secret;
        break;
      case 'flag':
        out.flag = payload.flag;
        out.secret = payload.envelope.secret;
        break;
      case 'env-multi':
        out.envVars = payload.envVars;
        out.values = payload.envelope.values;
        break;
      case 'file':
        out.filePath = payload.filePath;
        out.fileFormat = payload.fileFormat;
        out.content = payload.envelope.content;
        break;
      case 'login-command':
      case 'none':
        break;
    }

    // Run declarative post-process (e.g. OAuth refresh exchange).
    if (payload.postProcess && payload.postProcess.length) {
      out.extras = await this.postProcess.run({
        envelope: payload.envelope,
        steps: payload.postProcess,
        auth: {
          mode: payload.mode,
          envVar: payload.envVar,
          envVars: payload.envVars,
          filePath: payload.filePath,
          fileFormat: payload.fileFormat,
          flag: payload.flag,
        },
      });
    }

    if (payload.delivery && payload.delivery.length) {
      out.delivery = payload.delivery;
    }

    return out;
  }
}
