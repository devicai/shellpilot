import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Types } from 'mongoose';
import { CONFIG } from '../../config/config.loader';
import { ShellpilotModuleConfig } from '../../config/config.types';
import { AuthenticatedUser, ExtensionScope, PaginatedResponse } from '../../interfaces';
import { ApiKeysRepository } from './api-keys.repository';
import { ApiKey } from './schema/api-key.schema';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

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
    @Inject(CONFIG) private readonly config: ShellpilotModuleConfig,
  ) {}

  private randomToken(): { prefix: string; secret: string; token: string } {
    const prefix = randomBytes(PREFIX_LENGTH).toString('hex').slice(0, PREFIX_LENGTH);
    const secret = randomBytes(SECRET_LENGTH).toString('base64url');
    const token = `${this.config.auth.apiKeyPrefix}${prefix}.${secret}`;
    return { prefix, secret, token };
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
    if (dto.userId && dto.userId !== actor.id) {
      if (actor.role !== 'admin') {
        throw new ForbiddenException('Only admins can create API keys for other users');
      }
      ownerId = dto.userId;
    }

    const { prefix, secret, token } = this.randomToken();
    const secretHash = await bcrypt.hash(secret, BCRYPT_ROUNDS);

    const created = (await this.repo.create(
      {
        name: dto.name,
        prefix,
        secretHash,
        userId: new Types.ObjectId(ownerId),
        scopes: dto.scopes ?? [],
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
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

  async verify(rawToken: string): Promise<{ apiKey: ApiKey; id: string } | null> {
    const parsed = this.parseToken(rawToken);
    if (!parsed) return null;
    const key = (await this.repo.findByPrefix(parsed.prefix)) as (ApiKey & { _id: Types.ObjectId }) | null;
    if (!key) return null;
    if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return null;
    const ok = await bcrypt.compare(parsed.secret, key.secretHash);
    if (!ok) return null;
    const id = String(key._id);
    await this.repo.touchLastUsed(id);
    return { apiKey: key, id };
  }
}
