import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Trace, TraceSchema } from './schema/trace.schema';
import { TracesRepository } from './traces.repository';
import { TracesService } from './traces.service';
import { TracesController } from './traces.controller';
import { StatsService } from './stats/stats.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Trace.name, schema: TraceSchema }])],
  controllers: [TracesController],
  providers: [TracesRepository, TracesService, StatsService],
  exports: [TracesService],
})
export class TracesModule {}
