import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Trace, TraceSchema } from './schema/trace.schema';
import { TracesRepository } from './traces.repository';
import { TracesService } from './traces.service';
import { TracesController } from './traces.controller';
import { StatsService } from './stats/stats.service';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Trace.name, schema: TraceSchema }]),
    WebhooksModule,
  ],
  controllers: [TracesController],
  providers: [TracesRepository, TracesService, StatsService],
  exports: [TracesService],
})
export class TracesModule {}
