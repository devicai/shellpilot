import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Cli, CliSchema } from './schema/cli.schema';
import { ClisRepository } from './clis.repository';
import { ClisService } from './clis.service';
import { ClisImportExportService } from './import-export.service';
import { CatalogRegistryService } from './catalog-registry.service';
import { ClisController } from './clis.controller';
import { CatalogController } from './catalog.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: Cli.name, schema: CliSchema }])],
  controllers: [ClisController, CatalogController],
  providers: [ClisRepository, ClisService, ClisImportExportService, CatalogRegistryService],
  exports: [ClisService],
})
export class ClisModule {}
