import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type Decision = 'allow' | 'deny' | 'requires-approval';
export const DECISIONS: Decision[] = ['allow', 'deny', 'requires-approval'];

export type Enforcement = 'enforce' | 'warn' | 'audit';
export const ENFORCEMENTS: Enforcement[] = ['enforce', 'warn', 'audit'];

export type PolicyDocument = HydratedDocument<Policy>;

@Schema({ timestamps: true, collection: 'policies' })
export class Policy {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, enum: DECISIONS, default: 'deny' })
  defaultEffect!: Decision;

  @Prop({ required: true, enum: ENFORCEMENTS, default: 'warn' })
  enforcement!: Enforcement;

  @Prop({ type: [String], default: [] })
  clis!: string[];

  @Prop({ type: Object, default: {} })
  webhooks!: Record<string, string>;

  @Prop({ default: 1 })
  version!: number;

  @Prop({ default: false, index: true })
  active!: boolean;
}

export const PolicySchema = SchemaFactory.createForClass(Policy);

PolicySchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    r.id = r._id;
    delete r._id;
    delete r.__v;
    return r;
  },
});
