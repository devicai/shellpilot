import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { BaseRepository } from '../../repositories/base.repository';
import { EXTENSIONS_TOKEN } from '../../providers/extensions.provider';
import { ExtensionProperty } from '../../config/config.types';
import { Trace } from './schema/trace.schema';

@Injectable()
export class TracesRepository extends BaseRepository<Trace> {
  constructor(
    @InjectModel(Trace.name) model: Model<Trace>,
    @Inject(EXTENSIONS_TOKEN) extensions: ExtensionProperty[],
  ) {
    super(model, Trace.name, extensions);
  }

  async aggregate<T = Record<string, unknown>>(pipeline: PipelineStage[]): Promise<T[]> {
    return this.model.aggregate(pipeline).exec() as Promise<T[]>;
  }
}
