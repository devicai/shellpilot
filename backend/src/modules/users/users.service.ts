import { ConflictException, forwardRef, Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { CONFIG } from '../../config/config.loader';
import { ShellpilotModuleConfig } from '../../config/config.types';
import { ExtensionScope, PaginatedResponse } from '../../interfaces';
import { UsersRepository } from './users.repository';
import { User, UserRole, UserType } from './schema/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RulesService } from '../rules/rules.service';

/** Identity asserted by an external provider (external-jwt) or a consuming entity. */
export interface ExternalIdentity {
  externalUserId: string;
  email?: string;
  name?: string;
  role?: UserRole;
}

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly repo: UsersRepository,
    @Inject(CONFIG) private readonly config: ShellpilotModuleConfig,
    @Inject(forwardRef(() => RulesService)) private readonly rules: RulesService,
  ) {}

  async onModuleInit() {
    const count = await this.repo.countAll();
    if (count > 0) return;

    const bootstrap = this.config.auth.bootstrap;
    if (!bootstrap?.adminEmail || !bootstrap?.adminPassword) {
      this.logger.warn('No users exist and no auth.bootstrap configured; the admin must be created manually.');
      return;
    }

    await this.create(
      {
        email: bootstrap.adminEmail,
        password: bootstrap.adminPassword,
        name: 'Bootstrap Admin',
        role: 'admin',
        active: true,
      },
      {},
    );
    this.logger.log(`Bootstrap admin created: ${bootstrap.adminEmail}`);
  }

  async create(dto: CreateUserDto, scope: ExtensionScope): Promise<User> {
    const existing = await this.repo.findByEmail(dto.email, scope);
    if (existing) {
      throw new ConflictException(`User with email ${dto.email} already exists`);
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const created = await this.repo.create(
      {
        email: dto.email.toLowerCase(),
        passwordHash,
        name: dto.name,
        role: dto.role ?? 'viewer',
        type: dto.type ?? 'human',
        policyId: dto.policyId ? new Types.ObjectId(dto.policyId) : undefined,
        profileId: dto.profileId ? new Types.ObjectId(dto.profileId) : undefined,
        active: dto.active ?? true,
      },
      scope,
    );

    // User-first default: a user created without a profile (and without a
    // directly-assigned policy) gets their own individual, owner-scoped rules
    // straight away, ready to configure CLIs & rules. Picking a profile opts
    // out — the profile carries the policy instead.
    if (!dto.profileId && !dto.policyId) {
      return this.ensureIndividualRules(created, scope);
    }
    return created;
  }

  // Give a user their own individual, owner-scoped policy and assign it. Shared
  // by local create() and external-identity upsert so every freshly-provisioned
  // principal starts with a private rules surface to configure.
  private async ensureIndividualRules(user: User, scope: ExtensionScope): Promise<User> {
    const userId = String((user as unknown as { _id: Types.ObjectId })._id);
    const policy = await this.rules.createPolicy(
      {
        name: `Individual rules — ${user.email}`,
        description: `Private CLIs & rules for ${user.email}`,
        ownerUserId: userId,
      },
      scope,
    );
    const policyId = String((policy as unknown as { _id: Types.ObjectId })._id);
    const updated = await this.repo.updateById(
      userId,
      { policyId: new Types.ObjectId(policyId) },
      scope,
    );
    return updated ?? user;
  }

  /**
   * Find-or-create a user keyed by their external identity binding
   * `(scope, externalUserId)`. Idempotent: a repeat call returns the same user,
   * refreshing the mirrored email/name from the provider if they changed. Used
   * by the external-jwt strategy (JIT human provisioning) and by service-account
   * provisioning. Never sets a password — these principals cannot log in locally.
   */
  async ssoUpsert(identity: ExternalIdentity, scope: ExtensionScope): Promise<User> {
    return this.upsertByExternalId(identity, 'human', scope);
  }

  /**
   * Ensure a `service` user exists for a consuming entity (an agent/automation),
   * keyed by `(scope, externalUserId)`. The caller mints an API key for it; the
   * service account never has a password.
   */
  async ensureServiceAccount(identity: ExternalIdentity, scope: ExtensionScope): Promise<User> {
    return this.upsertByExternalId(identity, 'service', scope);
  }

  private async upsertByExternalId(
    identity: ExternalIdentity,
    type: UserType,
    scope: ExtensionScope,
  ): Promise<User> {
    const externalUserId = identity.externalUserId?.trim();
    if (!externalUserId) {
      throw new ConflictException('Missing externalUserId for external-identity upsert');
    }

    const existing = await this.repo.findByExternalUserId(externalUserId, scope);
    if (existing) {
      // Keep the local mirror fresh with the provider's latest profile, but never
      // touch locally-managed fields (role, profileId, policyId, active).
      const patch: Partial<User> = {};
      const email = identity.email?.toLowerCase();
      if (email && email !== existing.email) patch.email = email;
      if (identity.name && identity.name !== existing.name) patch.name = identity.name;
      if (Object.keys(patch).length === 0) return existing;
      const updated = await this.repo.updateById(
        String((existing as unknown as { _id: Types.ObjectId })._id),
        patch,
        scope,
      );
      return updated ?? existing;
    }

    const created = await this.repo.create(
      {
        email: (identity.email ?? this.syntheticEmail(externalUserId, type)).toLowerCase(),
        name: identity.name ?? externalUserId,
        role: identity.role ?? (type === 'service' ? 'operator' : 'viewer'),
        type,
        externalUserId,
        active: true,
      },
      scope,
    );
    return this.ensureIndividualRules(created, scope);
  }

  // Stable, deterministic placeholder address when the provider supplies no email
  // (always the case for service accounts). The externalUserId already guarantees
  // per-tenant uniqueness, so this only needs to be a syntactically-valid local
  // mirror, never a deliverable address.
  private syntheticEmail(externalUserId: string, type: UserType): string {
    const domain = type === 'service' ? 'service.local' : 'sso.local';
    const local = externalUserId.replace(/[^a-zA-Z0-9._-]/g, '-');
    return `${local}@${domain}`;
  }

  async list(scope: ExtensionScope, opts: { limit?: number; offset?: number }): Promise<PaginatedResponse<User>> {
    return this.repo.find({}, scope, opts);
  }

  async findById(id: string, scope: ExtensionScope): Promise<User> {
    const user = await this.repo.findById(id, scope);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string, scope: ExtensionScope = {}): Promise<User | null> {
    return this.repo.findByEmail(email, scope);
  }

  async update(id: string, dto: UpdateUserDto, scope: ExtensionScope): Promise<User> {
    const patch: Partial<User> & {
      profileId?: Types.ObjectId | null;
      policyId?: Types.ObjectId | null;
    } = { ...dto } as never;
    // Allow clearing via empty string from the UI as well as null. Mongoose
    // treats `null` as a $set null, which clears the field. Profile and direct
    // policy are mutually exclusive in the UI but the backend tolerates both
    // (direct policy wins in resolution).
    if (dto.profileId !== undefined) {
      patch.profileId = dto.profileId
        ? new Types.ObjectId(dto.profileId)
        : (null as unknown as Types.ObjectId);
    }
    if (dto.policyId !== undefined) {
      patch.policyId = dto.policyId
        ? new Types.ObjectId(dto.policyId)
        : (null as unknown as Types.ObjectId);
    }
    const user = await this.repo.updateById(id, patch as Partial<User>, scope);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async changePassword(id: string, newPassword: string, scope: ExtensionScope): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const user = await this.repo.updateById(id, { passwordHash }, scope);
    if (!user) throw new NotFoundException('User not found');
  }

  async delete(id: string, scope: ExtensionScope): Promise<void> {
    const ok = await this.repo.deleteById(id, scope);
    if (!ok) throw new NotFoundException('User not found');
  }

  async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = await this.repo.findByEmail(email);
    if (!user || !user.active) return null;
    // Users provisioned via an external IdP or as service accounts have no
    // password and must never be authenticable with local login.
    if (!user.passwordHash) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    return user;
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.repo.touchLastLogin(id);
  }
}
