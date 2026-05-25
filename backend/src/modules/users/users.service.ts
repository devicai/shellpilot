import { ConflictException, Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { CONFIG } from '../../config/config.loader';
import { ShellpilotModuleConfig } from '../../config/config.types';
import { ExtensionScope, PaginatedResponse } from '../../interfaces';
import { UsersRepository } from './users.repository';
import { User } from './schema/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly repo: UsersRepository,
    @Inject(CONFIG) private readonly config: ShellpilotModuleConfig,
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
    const existing = await this.repo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException(`User with email ${dto.email} already exists`);
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    return this.repo.create(
      {
        email: dto.email.toLowerCase(),
        passwordHash,
        name: dto.name,
        role: dto.role ?? 'viewer',
        profileId: dto.profileId ? new Types.ObjectId(dto.profileId) : undefined,
        active: dto.active ?? true,
      },
      scope,
    );
  }

  async list(scope: ExtensionScope, opts: { limit?: number; offset?: number }): Promise<PaginatedResponse<User>> {
    return this.repo.find({}, scope, opts);
  }

  async findById(id: string, scope: ExtensionScope): Promise<User> {
    const user = await this.repo.findById(id, scope);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findByEmail(email);
  }

  async update(id: string, dto: UpdateUserDto, scope: ExtensionScope): Promise<User> {
    const patch: Partial<User> & { profileId?: Types.ObjectId | null } = { ...dto } as never;
    if (dto.profileId !== undefined) {
      // Allow clearing via empty string from the UI ("no profile") as well as
      // null. Mongoose treats `null` as a $set null, which clears the field.
      patch.profileId = dto.profileId
        ? new Types.ObjectId(dto.profileId)
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
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    return user;
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.repo.touchLastLogin(id);
  }
}
