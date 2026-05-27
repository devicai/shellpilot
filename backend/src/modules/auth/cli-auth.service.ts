import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Types } from 'mongoose';
import { RedisService } from '../../redis/redis.service';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { UsersService } from '../users/users.service';

const ENROLL_PREFIX = 'shellpilot:enroll:';
const ENROLL_TTL_SECONDS = 24 * 60 * 60; // 24h

export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

export interface MintedCredential {
  apiKey: string;
  user: PublicUser;
}

/**
 * Backs the three CLI authentication flows. The common outcome is a named,
 * per-device API key for a user — the only credential the wrapper stores.
 *   - provision        (case 1): admin mints a key for a service account directly.
 *   - generate/redeem  (case 3): admin emits a single-use enrollment token; the
 *     employee redeems it (authorised by an admin API key) for a real key.
 * (Case 2, browser login, mints via the JWT `POST /api-keys` from the frontend.)
 */
@Injectable()
export class CliAuthService {
  constructor(
    private readonly redis: RedisService,
    private readonly apiKeys: ApiKeysService,
    private readonly users: UsersService,
  ) {}

  /** Case 1 — admin provisions a service account (by id or email) directly. */
  async provision(serviceAccount: string, name: string | undefined, callerUserId: string): Promise<MintedCredential> {
    await this.requireAdmin(callerUserId);
    const userId = await this.apiKeys.resolveUserId(serviceAccount);
    const user = await this.users.findById(userId, {});
    const issued = await this.apiKeys.mintForUser(userId, name?.trim() || `cli-provision-${this.today()}`);
    return { apiKey: issued.token, user: this.publicUser(user) };
  }

  /** Case 3a — admin generates a single-use enrollment token for a user. */
  async generateEnrollment(userId: string, callerUserId: string): Promise<{ enrollToken: string; expiresAt: string; userEmail: string }> {
    await this.requireAdmin(callerUserId);
    const user = await this.users.findById(userId, {}); // throws if not found
    const token = randomBytes(24).toString('base64url');
    await this.redis.setex(ENROLL_PREFIX + token, ENROLL_TTL_SECONDS, userId);
    return {
      enrollToken: token,
      expiresAt: new Date(Date.now() + ENROLL_TTL_SECONDS * 1000).toISOString(),
      userEmail: user.email,
    };
  }

  /** Case 3b — redeem the enrollment token (authorised by an admin API key). */
  async redeemEnrollment(token: string, callerUserId: string): Promise<MintedCredential> {
    await this.requireAdmin(callerUserId);
    const key = ENROLL_PREFIX + token;
    const userId = await this.redis.get(key);
    if (!userId) throw new BadRequestException('Invalid or expired enrollment token');
    await this.redis.del(key); // single-use
    const user = await this.users.findById(userId, {});
    const issued = await this.apiKeys.mintForUser(userId, `cli-enroll-${this.today()}`);
    return { apiKey: issued.token, user: this.publicUser(user) };
  }

  /** Identity behind an API key (for `whoami`). */
  async whoami(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId, {});
    return this.publicUser(user);
  }

  private async requireAdmin(userId: string): Promise<void> {
    const u = await this.users.findById(userId, {}).catch(() => null);
    if (!u || u.role !== 'admin') {
      throw new ForbiddenException('Admin credentials required for this operation');
    }
  }

  private publicUser(u: { email: string; name: string }): PublicUser {
    return { id: String((u as unknown as { _id: Types.ObjectId })._id), email: u.email, name: u.name };
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
