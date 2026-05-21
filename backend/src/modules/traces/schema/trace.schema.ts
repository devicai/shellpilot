import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Enforcement, ENFORCEMENTS } from '../../rules/schema/policy.schema';
import { TRACE_DECISIONS, TraceDecision } from '../dto/create-trace.dto';

export type TraceDocument = HydratedDocument<Trace>;

@Schema({ timestamps: true, collection: 'traces' })
export class Trace {
  @Prop({ required: true, lowercase: true, trim: true, index: true })
  cli!: string;

  @Prop({ type: [String], default: [] })
  commandPath!: string[];

  @Prop({ type: [String], default: [] })
  args!: string[];

  @Prop({ required: true, enum: TRACE_DECISIONS, index: true })
  decision!: TraceDecision;

  @Prop({ enum: ENFORCEMENTS })
  enforcement?: Enforcement;

  @Prop({ type: Types.ObjectId, ref: 'Rule' })
  matchedRuleId?: Types.ObjectId;

  @Prop({ trim: true })
  matchedRulePath?: string;

  @Prop({ trim: true })
  reason?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  userId?: Types.ObjectId;

  @Prop({ trim: true })
  apiKeyPrefix?: string;

  @Prop({ trim: true })
  agent?: string;

  @Prop()
  durationMs?: number;

  @Prop()
  exitCode?: number;

  @Prop({ required: true, type: Date, index: true })
  timestamp!: Date;
}

export const TraceSchema = SchemaFactory.createForClass(Trace);
TraceSchema.index({ timestamp: -1 });
TraceSchema.index({ userId: 1, timestamp: -1 });
TraceSchema.index({ cli: 1, timestamp: -1 });

TraceSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    r.id = r._id;
    delete r._id;
    delete r.__v;
    return r;
  },
});
