import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from '../../repositories/base.repository';
import { EXTENSIONS_TOKEN } from '../../providers/extensions.provider';
import { ExtensionProperty } from '../../config/config.types';
import { ExtensionScope } from '../../interfaces';
import { Policy } from './schema/policy.schema';

@Injectable()
export class PoliciesRepository extends BaseRepository<Policy> {
  constructor(
    @InjectModel(Policy.name) model: Model<Policy>,
    @Inject(EXTENSIONS_TOKEN) extensions: ExtensionProperty[],
  ) {
    super(model, Policy.name, extensions);
  }

  async findActive(scope: ExtensionScope = {}): Promise<Policy | null> {
    return this.model.findOne(this.applyScope({ active: true }, scope)).exec();
  }

  // Scope is essential here: without it the updateMany would deactivate other
  // tenants' active policies.
  async deactivateOthers(activeId: string, scope: ExtensionScope = {}): Promise<void> {
    await this.model.updateMany(this.applyScope({ _id: { $ne: activeId } }, scope), { active: false }).exec();
  }
}
