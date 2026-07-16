import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Types } from 'mongoose';
import { RedisService } from '../../redis/redis.service';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { UsersService } from '../users/users.service';
import { ExtensionScope } from '../../interfaces';

const ENROLL_PREFIX = 'shellpilot:enroll:';
// Tombstone left behind after a token is redeemed, so a repeated redeem can be
// told apart from a never-existed / expired token (both are a plain GET miss).
const ENROLL_USED_PREFIX = 'shellpilot:enroll:used:';
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
 *   - mintSelf         (case 2): the authenticated user mints a per-device key
 *     for themselves (browser login flow; no admin required).
 *   - generate/redeem  (case 3): admin emits a single-use enrollment token; the
 *     employee redeems it (authorised by an admin API key) for a real key.
 */
@Injectable()
export class CliAuthService {
  constructor(
    private readonly redis: RedisService,
    private readonly apiKeys: ApiKeysService,
    private readonly users: UsersService,
  ) {}

  /** Case 1 — admin provisions a service account (by id or email) directly. */
  async provision(
    serviceAccount: string,
    name: string | undefined,
    callerUserId: string,
    scope: ExtensionScope = {},
  ): Promise<MintedCredential> {
    await this.requireAdmin(callerUserId, scope);
    const userId = await this.apiKeys.resolveUserId(serviceAccount, scope);
    const user = await this.users.findById(userId, scope);
    const issued = await this.apiKeys.mintForUser(
      userId,
      name?.trim() || `cli-provision-${this.today()}`,
      [],
      undefined,
      scope,
    );
    return { apiKey: issued.token, user: this.publicUser(user) };
  }

  /**
   * Ensure a service account exists for a consuming entity (keyed by its
   * `externalUserId` within the tenant) and mint an API key for it, in one call.
   * Idempotent on the account: repeated calls reuse the same service-account user
   * and add another key. Used to bind an automated caller (e.g. an agent) to a
   * tenant without a human in the loop.
   */
  async provisionServiceAccount(
    externalUserId: string,
    name: string | undefined,
    callerUserId: string,
    scope: ExtensionScope = {},
  ): Promise<MintedCredential> {
    await this.requireAdmin(callerUserId, scope);
    const sa = await this.users.ensureServiceAccount(
      { externalUserId, name },
      scope,
    );
    const userId = String((sa as unknown as { _id: Types.ObjectId })._id);
    const issued = await this.apiKeys.mintForUser(
      userId,
      name?.trim() || `sa-${externalUserId}`,
      [],
      undefined,
      scope,
    );
    return { apiKey: issued.token, user: this.publicUser(sa) };
  }

  /**
   * Case 2 — browser login: the authenticated user mints a per-device API key
   * for themselves. No admin check — anyone may issue their own key; the guard
   * has already verified the caller's identity (`callerUserId` is that user).
   */
  async mintSelf(
    callerUserId: string,
    name: string | undefined,
    scope: ExtensionScope = {},
  ): Promise<MintedCredential> {
    const user = await this.users.findById(callerUserId, scope);
    const issued = await this.apiKeys.mintForUser(
      callerUserId,
      name?.trim() || `cli-login-${this.today()}`,
      [],
      undefined,
      scope,
    );
    return { apiKey: issued.token, user: this.publicUser(user) };
  }

  /** Case 3a — admin generates a single-use enrollment token for a user. */
  async generateEnrollment(
    userId: string,
    caller: { id: string; role?: string },
    scope: ExtensionScope = {},
  ): Promise<{ enrollToken: string; expiresAt: string; userEmail: string }> {
    // The endpoint's RolesGuard already vetted the request principal's role.
    // For a delegated caller (trusted BFF, act-as scope) that role lives only
    // on the request — the local mirror keeps its own default — so honour the
    // guard-verified role here and fall back to the DB check only when the
    // principal carries no role.
    if (caller.role !== 'admin') await this.requireAdmin(caller.id, scope);
    const user = await this.users.findById(userId, scope); // throws if not found / cross-tenant
    const token = randomBytes(24).toString('base64url');
    await this.redis.setex(ENROLL_PREFIX + token, ENROLL_TTL_SECONDS, userId);
    return {
      enrollToken: token,
      expiresAt: new Date(Date.now() + ENROLL_TTL_SECONDS * 1000).toISOString(),
      userEmail: user.email,
    };
  }

  /** Case 3b — redeem the enrollment token (authorised by an admin API key). */
  async redeemEnrollment(
    token: string,
    callerUserId: string,
    scope: ExtensionScope = {},
  ): Promise<MintedCredential> {
    await this.requireAdmin(callerUserId, scope);
    const key = ENROLL_PREFIX + token;
    // Consume atomically so two concurrent redeems can't both succeed.
    const userId = await this.redis.getDel(key);
    if (!userId) {
      // A GET miss is ambiguous: the token may have been redeemed already, or it
      // may have expired / never existed. The tombstone disambiguates so the
      // wrapper can tell the user their credentials file is spent, not broken.
      const used = await this.redis.get(ENROLL_USED_PREFIX + token);
      if (used) {
        throw new BadRequestException(
          'This enrollment token has already been used. Enrollment tokens are single-use: ' +
            'the credentials file was already redeemed for an API key. Generate a new credentials ' +
            'file from Devic and enroll again.',
        );
      }
      throw new BadRequestException(
        'Invalid or expired enrollment token. Enrollment tokens expire 24h after being issued. ' +
          'Generate a new credentials file from Devic and enroll again.',
      );
    }
    // Leave a tombstone for the token's remaining lifetime so a repeated redeem
    // reports "already used" instead of the ambiguous expired/invalid message.
    await this.redis.setex(ENROLL_USED_PREFIX + token, ENROLL_TTL_SECONDS, userId);
    const user = await this.users.findById(userId, scope);
    const issued = await this.apiKeys.mintForUser(userId, `cli-enroll-${this.today()}`, [], undefined, scope);
    return { apiKey: issued.token, user: this.publicUser(user) };
  }

  /** Identity behind an API key (for `whoami`). */
  async whoami(userId: string, scope: ExtensionScope = {}): Promise<PublicUser> {
    const user = await this.users.findById(userId, scope);
    return this.publicUser(user);
  }

  // Role is a property of the caller's identity, which the auth guard already
  // verified belongs to this request — so the role check resolves the caller by
  // id alone, NOT under the request's tenant scope. This lets an internal/global
  // admin (whose key carries no tenant binding) act on a tenant supplied by
  // header, while every *data* operation below it stays tenant-fenced by `scope`.
  // A per-tenant admin's key still pins its own tenant, so it can never widen.
  private async requireAdmin(userId: string, _scope: ExtensionScope = {}): Promise<void> {
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
