import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseRepository } from '../../repositories/base.repository';
import { EXTENSIONS_TOKEN } from '../../providers/extensions.provider';
import { ExtensionProperty } from '../../config/config.types';
import { Rule } from './schema/rule.schema';

@Injectable()
export class RulesRepository extends BaseRepository<Rule> {
  constructor(
    @InjectModel(Rule.name) model: Model<Rule>,
    @Inject(EXTENSIONS_TOKEN) extensions: ExtensionProperty[],
  ) {
    super(model, Rule.name, extensions);
  }

  async findByPolicy(policyId: string): Promise<Rule[]> {
    return this.model
      .find({ policyId: new Types.ObjectId(policyId) })
      .sort({ priority: -1, createdAt: 1 })
      .exec();
  }

  async deleteByPolicy(policyId: string): Promise<void> {
    await this.model.deleteMany({ policyId: new Types.ObjectId(policyId) }).exec();
  }
}
