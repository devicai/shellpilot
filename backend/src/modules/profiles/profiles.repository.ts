import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from '../../repositories/base.repository';
import { EXTENSIONS_TOKEN } from '../../providers/extensions.provider';
import { ExtensionProperty } from '../../config/config.types';
import { Profile } from './schema/profile.schema';

@Injectable()
export class ProfilesRepository extends BaseRepository<Profile> {
  constructor(
    @InjectModel(Profile.name) model: Model<Profile>,
    @Inject(EXTENSIONS_TOKEN) extensions: ExtensionProperty[],
  ) {
    super(model, Profile.name, extensions);
  }

  async findByName(name: string): Promise<Profile | null> {
    return this.model.findOne({ name }).exec();
  }
}
