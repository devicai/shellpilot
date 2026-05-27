import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from '../../../redis/redis.service';
import { CONFIG } from '../../../config/config.loader';
import { ShellpilotModuleConfig } from '../../../config/config.types';
import { CliAuthMode, OsPath } from '../../clis-catalog/schema/cli.schema';

const PREFIX = 'shellpilot:jit:';

export interface VaultEnvelope {
  secret?: string;
  values?: Record<string, string>;
  content?: string;
}

export interface JitPayload {
  userId: string;
  cli: string;
  mode: CliAuthMode;
  envVar?: string;
  envVars?: string[];
  filePath?: OsPath;
  fileFormat?: string;
  flag?: string;
  envelope: VaultEnvelope;
  // Snapshot of the catalog's declarative auth config at issue time.
  // Run server-side at verify (postProcess) and applied client-side by the
  // wrapper (delivery).
  postProcess?: Array<Record<string, unknown>>;
  delivery?: Array<Record<string, unknown>>;
  commandPath?: string[];
  issuedAt: number;
}

@Injectable()
export class JitTokenService {
  constructor(
    private readonly redis: RedisService,
    @Inject(CONFIG) private readonly config: ShellpilotModuleConfig,
  ) {}

  private newToken(): string {
    return `jit_${randomBytes(24).toString('base64url')}`;
  }

  async issue(payload: Omit<JitPayload, 'issuedAt'>): Promise<{ jitToken: string; expiresIn: number }> {
    const token = this.newToken();
    const data: JitPayload = { ...payload, issuedAt: Date.now() };
    const ttl = this.config.jit.ttlSeconds;
    await this.redis.setex(PREFIX + token, ttl, JSON.stringify(data));
    return { jitToken: token, expiresIn: ttl };
  }

  /** Atomically retrieves and consumes a JIT token. Returns null if missing/expired. */
  async consume(token: string): Promise<JitPayload | null> {
    const raw = await this.redis.getDel(PREFIX + token);
    if (!raw) return null;
    return JSON.parse(raw) as JitPayload;
  }
}
