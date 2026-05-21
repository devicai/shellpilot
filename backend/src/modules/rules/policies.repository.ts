import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from '../../repositories/base.repository';
import { EXTENSIONS_TOKEN } from '../../providers/extensions.provider';
import { ExtensionProperty } from '../../config/config.types';
import { Policy } from './schema/policy.schema';

@Injectable()
export class PoliciesRepository extends BaseRepository<Policy> {
  constructor(
    @InjectModel(Policy.name) model: Model<Policy>,
    @Inject(EXTENSIONS_TOKEN) extensions: ExtensionProperty[],
  ) {
    super(model, Policy.name, extensions);
  }

  async findActive(): Promise<Policy | null> {
    return this.model.findOne({ active: true }).exec();
  }

  async deactivateOthers(activeId: string): Promise<void> {
    await this.model.updateMany({ _id: { $ne: activeId } }, { active: false }).exec();
  }
}
