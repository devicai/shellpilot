import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ApiKeyDocument = HydratedDocument<ApiKey>;

@Schema({ timestamps: true, collection: 'api_keys' })
export class ApiKey {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, index: true })
  prefix!: string;

  @Prop({ required: true })
  secretHash!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  scopes!: string[];

  @Prop()
  lastUsedAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop({ default: true })
  active!: boolean;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);

ApiKeySchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    delete r.secretHash;
    r.id = r._id;
    delete r._id;
    delete r.__v;
    return r;
  },
});
