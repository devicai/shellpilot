import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from '../../repositories/base.repository';
import { EXTENSIONS_TOKEN } from '../../providers/extensions.provider';
import { ExtensionProperty } from '../../config/config.types';
import { ExtensionScope } from '../../interfaces';
import { User } from './schema/user.schema';

@Injectable()
export class UsersRepository extends BaseRepository<User> {
  constructor(
    @InjectModel(User.name) model: Model<User>,
    @Inject(EXTENSIONS_TOKEN) extensions: ExtensionProperty[],
  ) {
    super(model, User.name, extensions);
  }

  // Optional scope: callers within a tenant (duplicate checks, reference
  // resolution) pass it so email is unique per tenant. Local login passes none
  // (bootstrap/standalone admin is global by design).
  async findByEmail(email: string, scope: ExtensionScope = {}): Promise<User | null> {
    return this.model.findOne(this.applyScope({ email: email.toLowerCase() }, scope)).exec();
  }

  // Resolve a user by their external identity binding within a tenant. Used by
  // SSO upsert (external-jwt) and service-account provisioning.
  async findByExternalUserId(
    externalUserId: string,
    scope: ExtensionScope = {},
  ): Promise<User | null> {
    return this.model.findOne(this.applyScope({ externalUserId }, scope)).exec();
  }

  async countAll(): Promise<number> {
    return this.model.countDocuments({}).exec();
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.model.updateOne({ _id: id }, { lastLoginAt: new Date() }).exec();
  }
}
