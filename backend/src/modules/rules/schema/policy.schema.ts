import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type Decision = 'allow' | 'deny' | 'requires-approval';
export const DECISIONS: Decision[] = ['allow', 'deny', 'requires-approval'];

export type Enforcement = 'enforce' | 'warn' | 'audit';
export const ENFORCEMENTS: Enforcement[] = ['enforce', 'warn', 'audit'];

// Event keys a policy can route to a webhook. Maps 1:1 to the trace decisions
// most operators want to forward — denies and approvals are the load-bearing
// signals; jit-issued and binary-missing are useful for fleet visibility.
export type WebhookEvent =
  | 'on_deny'
  | 'on_requires_approval'
  | 'on_jit_issued'
  | 'on_binary_missing';
export const WEBHOOK_EVENTS: WebhookEvent[] = [
  'on_deny',
  'on_requires_approval',
  'on_jit_issued',
  'on_binary_missing',
];

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

  // Map of event → outbound URL. Empty/missing entries are no-ops. Allowed
  // keys are documented by WEBHOOK_EVENTS; unknown keys are tolerated so
  // future events ship without a schema migration.
  @Prop({ type: Object, default: {} })
  webhooks!: Partial<Record<WebhookEvent, string>> & Record<string, string>;

  // Shared HMAC secret used to sign every outgoing webhook body. Receivers
  // verify with `X-ShellPilot-Signature: sha256=<hex>`. Optional — if empty,
  // payloads ship unsigned (visible recommendation in the UI not to use in
  // production without a secret).
  @Prop({ trim: true })
  webhookSecret?: string;

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
