import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseRepository } from '../../repositories/base.repository';
import { EXTENSIONS_TOKEN } from '../../providers/extensions.provider';
import { ExtensionProperty } from '../../config/config.types';
import { VaultEntry } from './schema/vault-entry.schema';

@Injectable()
export class CredentialsRepository extends BaseRepository<VaultEntry> {
  constructor(
    @InjectModel(VaultEntry.name) model: Model<VaultEntry>,
    @Inject(EXTENSIONS_TOKEN) extensions: ExtensionProperty[],
  ) {
    super(model, VaultEntry.name, extensions);
  }

  async findForUserAndCli(userId: string, cli: string): Promise<VaultEntry | null> {
    return this.model
      .findOne({ userId: new Types.ObjectId(userId), cli: cli.toLowerCase() })
      .exec();
  }

  async upsertForUserAndCli(
    userId: string,
    cli: string,
    envVar: string,
    secretCiphertext: string,
    secretIv: string,
    secretTag: string,
  ): Promise<VaultEntry> {
    return (await this.model
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId), cli: cli.toLowerCase(), envVar },
        { secretCiphertext, secretIv, secretTag },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec()) as VaultEntry;
  }
}
