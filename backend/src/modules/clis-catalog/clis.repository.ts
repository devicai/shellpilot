import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from '../../repositories/base.repository';
import { EXTENSIONS_TOKEN } from '../../providers/extensions.provider';
import { ExtensionProperty } from '../../config/config.types';
import { Cli } from './schema/cli.schema';

@Injectable()
export class ClisRepository extends BaseRepository<Cli> {
  constructor(
    @InjectModel(Cli.name) model: Model<Cli>,
    @Inject(EXTENSIONS_TOKEN) extensions: ExtensionProperty[],
  ) {
    super(model, Cli.name, extensions);
  }

  async findBySlug(slug: string): Promise<Cli | null> {
    return this.model.findOne({ slug: slug.toLowerCase() }).exec();
  }
}
