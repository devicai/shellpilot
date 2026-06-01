import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseRepository } from '../../repositories/base.repository';
import { EXTENSIONS_TOKEN } from '../../providers/extensions.provider';
import { ExtensionProperty } from '../../config/config.types';
import { ExtensionScope } from '../../interfaces';
import { Rule } from './schema/rule.schema';

@Injectable()
export class RulesRepository extends BaseRepository<Rule> {
  constructor(
    @InjectModel(Rule.name) model: Model<Rule>,
    @Inject(EXTENSIONS_TOKEN) extensions: ExtensionProperty[],
  ) {
    super(model, Rule.name, extensions);
  }

  async findByPolicy(policyId: string, scope: ExtensionScope = {}): Promise<Rule[]> {
    return this.model
      .find(this.applyScope({ policyId: new Types.ObjectId(policyId) }, scope))
      .sort({ priority: -1, createdAt: 1 })
      .exec();
  }

  async deleteByPolicy(policyId: string, scope: ExtensionScope = {}): Promise<void> {
    await this.model.deleteMany(this.applyScope({ policyId: new Types.ObjectId(policyId) }, scope)).exec();
  }
}
