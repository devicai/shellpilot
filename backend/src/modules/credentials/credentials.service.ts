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
import { PolicyEvaluatorService } from '../rules/evaluator/policy-evaluator.service';
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
    private readonly evaluator: PolicyEvaluatorService,
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

    return this.repo.upsertForUserAndCli(
      ownerId,
      cli.slug,
      {
        mode: auth.mode,
        envVar: auth.envVar,
        envVars: auth.envVars,
        filePath: auth.filePath,
        fileFormat: auth.fileFormat,
        flag: auth.flag,
        envelopeCiphertext: sealed.ciphertext,
        envelopeIv: sealed.iv,
        envelopeTag: sealed.tag,
      },
      scope,
    );
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

  async issue(
    dto: IssueCredentialDto,
    scope: ExtensionScope,
  ): Promise<{ jitToken: string; expiresIn: number }> {
    // Identity is set by the controller from the authenticated API key.
    const userId = dto.userId;
    if (!userId) {
      throw new BadRequestException('Missing identity (no API key user)');
    }
    // Every lookup below is tenant-scoped: a key from one tenant cannot issue
    // credentials against another tenant's user / profile / vault entry, even if
    // it supplies a foreign userId.
    // Profile gate: if the user has a profile assigned and it whitelists CLIs,
    // refuse early when the requested cli isn't in the list. Department
    // boundaries: a marketing user shouldn't be able to issue gcloud creds
    // even if a vault entry exists for them. The wrapper turns this into a
    // policy-deny equivalent at the call site.
    const user = (await this.users.findById(userId, scope)) as
      | { profileId?: { toString(): string } }
      | null;
    if (!user) {
      throw new NotFoundException(`No user ${userId} in this tenant`);
    }
    if (user.profileId) {
      const profile = await this.profiles.findById(user.profileId.toString(), scope);
      if (profile && profile.clis && profile.clis.length > 0) {
        const allowed = profile.clis.map((s) => s.toLowerCase());
        if (!allowed.includes(dto.cli.toLowerCase())) {
          throw new ForbiddenException(
            `CLI '${dto.cli}' is not allowed by the user's profile`,
          );
        }
      }
    }

    // Server-side policy re-evaluation. The wrapper decides allow/deny locally
    // against a rules cache that lives on the user's machine and can be forged.
    // Re-checking the rule HERE — at the point the real secret would be
    // released — makes the local decision non-authoritative: a tampered local
    // policy can flip the wrapper's view, but it can never obtain a credential
    // the org's policy denies. `commandPath` maps directly onto the evaluator's
    // `args` (both already exclude the leading cli segment).
    const evaluation = await this.evaluator.evaluate(
      dto.cli,
      dto.commandPath ?? [],
      { userId },
      scope,
    );
    if (evaluation.decision !== 'allow') {
      // Audit the denied attempt regardless of enforcement mode, so operators
      // see forged-policy escalation attempts even under monitor policies.
      await this.traceDeny(dto, userId, evaluation, scope);
      // Only enforcing policies block issuance. Monitor modes (warn / audit)
      // observe but let the command proceed, matching the evaluator's own
      // contract (see PolicyEvaluatorService). The distinct `policy-deny` code
      // lets the wrapper treat this as a hard block instead of a missing
      // credential (which would fall through to the user's local secrets).
      if (evaluation.enforcement === 'enforce') {
        // The marker rides in `details` because the global HttpExceptionFilter
        // only forwards message / error / details — a top-level `code` would be
        // dropped. The wrapper keys off details.code to hard-block.
        throw new ForbiddenException({
          error: 'Forbidden',
          message: `Command denied by policy${
            evaluation.matchedRule?.reason ? `: ${evaluation.matchedRule.reason}` : ''
          }`,
          details: { code: 'policy-deny' },
        });
      }
    }

    const entry = await this.repo.findForUserAndCli(userId, dto.cli, scope);
    if (!entry) {
      throw new NotFoundException(
        `No credential stored for user ${userId} and CLI ${dto.cli}`,
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
    const cli = await this.clis.findOne(dto.cli, scope);
    const auth = cli.auth ?? { mode: entry.mode };

    const issued = await this.jit.issue({
      userId,
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
      scope,
    });

    // Trace the JIT issuance so operators see who is fetching which credential
    // independently of whether the wrapper later posts an exec trace. Failure
    // here is non-fatal — issuance succeeded and we don't want a trace hiccup
    // to mask a working credential flow.
    try {
      await this.traces.ingest(
        {
          cli: dto.cli,
          commandPath: dto.commandPath ?? [],
          decision: 'jit-issued',
          userId: dto.userId,
          agent: 'shellpilot-backend',
        },
        scope,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to emit jit-issued trace for user=${dto.userId} cli=${dto.cli}: ${(err as Error).message}`,
      );
    }

    return issued;
  }

  /**
   * Emit a `deny` trace for an issuance blocked (or observed, under monitor) by
   * server-side policy re-evaluation. Best-effort: a trace hiccup must not turn
   * a policy decision into a 500. Uses the `deny` decision (the trace enum has
   * no dedicated `policy-deny`) plus the enforcement mode and matched rule so
   * operators can tell an enforced block from a monitored observation.
   */
  private async traceDeny(
    dto: IssueCredentialDto,
    userId: string,
    evaluation: Awaited<ReturnType<PolicyEvaluatorService['evaluate']>>,
    scope: ExtensionScope,
  ): Promise<void> {
    try {
      await this.traces.ingest(
        {
          cli: dto.cli,
          commandPath: dto.commandPath ?? [],
          decision: 'deny',
          enforcement: evaluation.enforcement,
          matchedRulePath: evaluation.matchedRule?.path,
          reason: evaluation.matchedRule?.reason,
          userId,
          agent: 'shellpilot-backend',
        },
        scope,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to emit policy-deny trace for user=${userId} cli=${dto.cli}: ${(err as Error).message}`,
      );
    }
  }

  async verify(dto: VerifyCredentialDto, scope: ExtensionScope): Promise<JitVerifyResponse> {
    const payload = await this.jit.consume(dto.jitToken);
    if (!payload) {
      throw new NotFoundException('JIT token not found or already consumed');
    }
    // Tenant fence: a token may only be consumed from the tenant that issued it.
    // Compares every configured extension value carried on the JIT payload.
    if (payload.scope) {
      for (const [key, value] of Object.entries(payload.scope)) {
        if (scope[key] !== value) {
          throw new ForbiddenException('JIT token does not belong to this tenant');
        }
      }
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
