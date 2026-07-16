import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Types } from 'mongoose';
import { CONFIG } from '../../config/config.loader';
import { ExtensionProperty, ShellpilotModuleConfig } from '../../config/config.types';
import { AuthenticatedApiKey, AuthenticatedUser, ExtensionScope, PaginatedResponse } from '../../interfaces';
import { EXTENSIONS_TOKEN } from '../../providers/extensions.provider';
import { deriveAuthScope } from '../../common/scope/derive-auth-scope';
import { ApiKeysRepository } from './api-keys.repository';
import { ApiKey } from './schema/api-key.schema';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { UsersService } from '../users/users.service';

const PREFIX_LENGTH = 8;
const SECRET_LENGTH = 32;
const BCRYPT_ROUNDS = 10;

export interface IssuedApiKey {
  id: string;
  name: string;
  prefix: string;
  /** Plaintext token. Returned ONLY on create/rotate, never persisted. */
  token: string;
  scopes: string[];
  expiresAt?: Date;
  createdAt: Date;
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly repo: ApiKeysRepository,
    private readonly users: UsersService,
    @Inject(CONFIG) private readonly config: ShellpilotModuleConfig,
    @Inject(EXTENSIONS_TOKEN) private readonly extensions: ExtensionProperty[],
  ) {}

  private randomToken(): { prefix: string; secret: string; token: string } {
    const prefix = randomBytes(PREFIX_LENGTH).toString('hex').slice(0, PREFIX_LENGTH);
    const secret = randomBytes(SECRET_LENGTH).toString('base64url');
    const token = `${this.config.auth.apiKeyPrefix}${prefix}.${secret}`;
    return { prefix, secret, token };
  }

  /**
   * Resolve the acting principal for a request that may carry a JWT user, a
   * delegated (act-as) user, or a bare API key. For a bare key the actor is the
   * key's owner, with the role read from the user record. Identity resolution
   * is deliberately global (`{}` scope) — the key already pins the tenant for
   * every data operation via the request scope.
   */
  async resolveActor(user?: AuthenticatedUser, apiKey?: AuthenticatedApiKey): Promise<AuthenticatedUser> {
    if (user) return user;
    if (!apiKey) throw new UnauthorizedException();
    const owner = await this.users.findById(apiKey.userId, {});
    return {
      id: apiKey.userId,
      email: owner.email,
      role: owner.role,
      name: owner.name,
      scope: apiKey.scope,
    };
  }

  parseToken(rawToken: string): { prefix: string; secret: string } | null {
    if (!rawToken.startsWith(this.config.auth.apiKeyPrefix)) return null;
    const body = rawToken.slice(this.config.auth.apiKeyPrefix.length);
    const dot = body.indexOf('.');
    if (dot < 0) return null;
    const prefix = body.slice(0, dot);
    const secret = body.slice(dot + 1);
    if (!prefix || !secret) return null;
    return { prefix, secret };
  }

  async create(dto: CreateApiKeyDto, actor: AuthenticatedUser, scope: ExtensionScope): Promise<IssuedApiKey> {
    let ownerId = actor.id;
    // Target another user either by id or by email; only admins may.
    const targetRef = dto.userId ?? dto.email;
    if (targetRef) {
      const resolvedId = await this.resolveUserId(targetRef, scope);
      if (resolvedId !== actor.id && actor.role !== 'admin') {
        throw new ForbiddenException('Only admins can create API keys for other users');
      }
      ownerId = resolvedId;
    }
    return this.mintForUser(ownerId, dto.name, dto.scopes ?? [], dto.expiresAt ? new Date(dto.expiresAt) : undefined, scope);
  }

  /**
   * Mint a named API key for a user. Bypasses actor checks — callers (provision,
   * enrollment) are responsible for authorising the operation. Plain token is
   * returned ONCE.
   */
  async mintForUser(
    ownerId: string,
    name: string,
    scopes: string[] = [],
    expiresAt?: Date,
    scope: ExtensionScope = {},
  ): Promise<IssuedApiKey> {
    const { prefix, secret, token } = this.randomToken();
    const secretHash = await bcrypt.hash(secret, BCRYPT_ROUNDS);

    const created = (await this.repo.create(
      {
        name,
        prefix,
        secretHash,
        userId: new Types.ObjectId(ownerId),
        scopes,
        expiresAt,
        active: true,
      },
      scope,
    )) as ApiKey & { _id: Types.ObjectId; createdAt: Date };

    return {
      id: String(created._id),
      name: created.name,
      prefix: created.prefix,
      token,
      scopes: created.scopes,
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
    };
  }

  /** Resolve a user reference (Mongo id or email) to a user id, within a tenant. */
  async resolveUserId(idOrEmail: string, scope: ExtensionScope = {}): Promise<string> {
    if (Types.ObjectId.isValid(idOrEmail)) {
      const byId = await this.users.findById(idOrEmail, scope).catch(() => null);
      if (byId) return idOrEmail;
    }
    const byEmail = await this.users.findByEmail(idOrEmail, scope);
    if (!byEmail) throw new NotFoundException(`No user or service account '${idOrEmail}'`);
    return String((byEmail as unknown as { _id: Types.ObjectId })._id);
  }

  async rotate(id: string, actor: AuthenticatedUser, scope: ExtensionScope): Promise<IssuedApiKey> {
    const existing = (await this.repo.findById(id, scope)) as (ApiKey & { _id: Types.ObjectId; createdAt: Date }) | null;
    if (!existing) throw new NotFoundException('API key not found');
    if (actor.role !== 'admin' && String(existing.userId) !== actor.id) {
      throw new ForbiddenException();
    }
    const { prefix, secret, token } = this.randomToken();
    const secretHash = await bcrypt.hash(secret, BCRYPT_ROUNDS);
    const updated = (await this.repo.updateById(id, { prefix, secretHash, lastUsedAt: undefined }, scope)) as ApiKey & { _id: Types.ObjectId; createdAt: Date };
    return {
      id: String(updated._id),
      name: updated.name,
      prefix: updated.prefix,
      token,
      scopes: updated.scopes,
      expiresAt: updated.expiresAt,
      createdAt: updated.createdAt,
    };
  }

  async list(actor: AuthenticatedUser, scope: ExtensionScope, opts: { limit?: number; offset?: number }): Promise<PaginatedResponse<ApiKey>> {
    if (actor.role === 'admin') {
      return this.repo.find({}, scope, opts);
    }
    return this.repo.find({ userId: new Types.ObjectId(actor.id) }, scope, opts);
  }

  async revoke(id: string, actor: AuthenticatedUser, scope: ExtensionScope): Promise<void> {
    const existing = (await this.repo.findById(id, scope)) as (ApiKey & { userId: Types.ObjectId }) | null;
    if (!existing) throw new NotFoundException('API key not found');
    if (actor.role !== 'admin' && String(existing.userId) !== actor.id) {
      throw new ForbiddenException();
    }
    await this.repo.deleteById(id, scope);
  }

  async verify(
    rawToken: string,
  ): Promise<{ apiKey: ApiKey; id: string; scope: ExtensionScope } | null> {
    const parsed = this.parseToken(rawToken);
    if (!parsed) return null;
    // Resolve by prefix globally — the prefix is unique across tenants and the
    // tenant is not yet known. The resolved key's own extension values then pin
    // the request's tenant for everything downstream.
    const key = (await this.repo.findByPrefix(parsed.prefix)) as (ApiKey & { _id: Types.ObjectId }) | null;
    if (!key) return null;
    if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return null;
    const ok = await bcrypt.compare(parsed.secret, key.secretHash);
    if (!ok) return null;
    const id = String(key._id);
    await this.repo.touchLastUsed(id);
    return { apiKey: key, id, scope: deriveAuthScope(key, this.extensions) };
  }
}
