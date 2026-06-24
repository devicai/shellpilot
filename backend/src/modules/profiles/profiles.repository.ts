import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from '../../repositories/base.repository';
import { EXTENSIONS_TOKEN } from '../../providers/extensions.provider';
import { ExtensionProperty } from '../../config/config.types';
import { ExtensionScope } from '../../interfaces';
import { Profile } from './schema/profile.schema';

@Injectable()
export class ProfilesRepository extends BaseRepository<Profile> implements OnModuleInit {
  constructor(
    @InjectModel(Profile.name) model: Model<Profile>,
    @Inject(EXTENSIONS_TOKEN) extensions: ExtensionProperty[],
  ) {
    super(model, Profile.name, extensions);
  }

  // Migrate the legacy global `name_1` index to the tenant-scoped one at boot.
  async onModuleInit(): Promise<void> {
    await this.syncIndexes();
  }

  async findByName(name: string, scope: ExtensionScope = {}): Promise<Profile | null> {
    return this.model.findOne(this.applyScope({ name }, scope)).exec();
  }
}
