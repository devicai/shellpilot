import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from '../../repositories/base.repository';
import { EXTENSIONS_TOKEN } from '../../providers/extensions.provider';
import { ExtensionProperty } from '../../config/config.types';
import { User } from './schema/user.schema';

@Injectable()
export class UsersRepository extends BaseRepository<User> {
  constructor(
    @InjectModel(User.name) model: Model<User>,
    @Inject(EXTENSIONS_TOKEN) extensions: ExtensionProperty[],
  ) {
    super(model, User.name, extensions);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.model.findOne({ email: email.toLowerCase() }).exec();
  }

  async countAll(): Promise<number> {
    return this.model.countDocuments({}).exec();
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.model.updateOne({ _id: id }, { lastLoginAt: new Date() }).exec();
  }
}
