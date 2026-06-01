import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseRepository } from '../../repositories/base.repository';
import { EXTENSIONS_TOKEN } from '../../providers/extensions.provider';
import { ExtensionProperty } from '../../config/config.types';
import { ExtensionScope } from '../../interfaces';
import { VaultEntry } from './schema/vault-entry.schema';
import { CliAuthMode, OsPath } from '../clis-catalog/schema/cli.schema';

export interface UpsertVaultFields {
  mode: CliAuthMode;
  envVar?: string;
  envVars?: string[];
  filePath?: OsPath;
  fileFormat?: string;
  flag?: string;
  envelopeCiphertext: string;
  envelopeIv: string;
  envelopeTag: string;
}

@Injectable()
export class CredentialsRepository extends BaseRepository<VaultEntry> {
  constructor(
    @InjectModel(VaultEntry.name) model: Model<VaultEntry>,
    @Inject(EXTENSIONS_TOKEN) extensions: ExtensionProperty[],
  ) {
    super(model, VaultEntry.name, extensions);
  }

  async findForUserAndCli(
    userId: string,
    cli: string,
    scope: ExtensionScope,
  ): Promise<VaultEntry | null> {
    return this.model
      .findOne(this.applyScope({ userId: new Types.ObjectId(userId), cli: cli.toLowerCase() }, scope))
      .exec();
  }

  async upsertForUserAndCli(
    userId: string,
    cli: string,
    fields: UpsertVaultFields,
    scope: ExtensionScope,
  ): Promise<VaultEntry> {
    return (await this.model
      .findOneAndUpdate(
        this.applyScope({ userId: new Types.ObjectId(userId), cli: cli.toLowerCase() }, scope),
        // Stamp the tenant on insert so the new vault entry is scoped from birth.
        { ...fields, ...scope },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec()) as VaultEntry;
  }
}
