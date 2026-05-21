import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Decision, DECISIONS } from './policy.schema';

export type RuleDocument = HydratedDocument<Rule>;

@Schema({ timestamps: true, collection: 'rules' })
export class Rule {
  @Prop({ type: Types.ObjectId, ref: 'Policy', required: true, index: true })
  policyId!: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  cli!: string;

  /**
   * Space-separated path with optional wildcards.
   * Examples: "repo delete *", "* * delete", "pr create".
   */
  @Prop({ required: true, trim: true })
  path!: string;

  @Prop({ required: true, enum: DECISIONS })
  effect!: Decision;

  @Prop({ trim: true })
  reason?: string;

  @Prop({ default: 0 })
  priority!: number;
}

export const RuleSchema = SchemaFactory.createForClass(Rule);
RuleSchema.index({ policyId: 1, cli: 1, priority: -1 });

RuleSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    r.id = r._id;
    delete r._id;
    delete r.__v;
    return r;
  },
});
