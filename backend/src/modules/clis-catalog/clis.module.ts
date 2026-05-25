import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Cli, CliSchema } from './schema/cli.schema';
import { ClisRepository } from './clis.repository';
import { ClisService } from './clis.service';
import { ClisImportExportService } from './import-export.service';
import { ClisController } from './clis.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: Cli.name, schema: CliSchema }])],
  controllers: [ClisController],
  providers: [ClisRepository, ClisService, ClisImportExportService],
  exports: [ClisService],
})
export class ClisModule {}
