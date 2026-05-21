import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseRepository } from '../../repositories/base.repository';
import { EXTENSIONS_TOKEN } from '../../providers/extensions.provider';
import { ExtensionProperty } from '../../config/config.types';
import { ApiKey } from './schema/api-key.schema';

@Injectable()
export class ApiKeysRepository extends BaseRepository<ApiKey> {
  constructor(
    @InjectModel(ApiKey.name) model: Model<ApiKey>,
    @Inject(EXTENSIONS_TOKEN) extensions: ExtensionProperty[],
  ) {
    super(model, ApiKey.name, extensions);
  }

  async findByPrefix(prefix: string): Promise<ApiKey | null> {
    return this.model.findOne({ prefix, active: true }).exec();
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.model.updateOne({ _id: id }, { lastUsedAt: new Date() }).exec();
  }

  async findByUser(userId: string): Promise<ApiKey[]> {
    return this.model.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).exec();
  }
}
