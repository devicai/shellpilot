import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type VaultEntryDocument = HydratedDocument<VaultEntry>;

@Schema({ timestamps: true, collection: 'vault_entries' })
export class VaultEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  cli!: string;

  @Prop({ required: true, trim: true })
  envVar!: string;

  @Prop({ required: true })
  secretCiphertext!: string;

  @Prop({ required: true })
  secretIv!: string;

  @Prop({ required: true })
  secretTag!: string;
}

export const VaultEntrySchema = SchemaFactory.createForClass(VaultEntry);
VaultEntrySchema.index({ userId: 1, cli: 1, envVar: 1 }, { unique: true });

VaultEntrySchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    delete r.secretCiphertext;
    delete r.secretIv;
    delete r.secretTag;
    r.id = r._id;
    delete r._id;
    delete r.__v;
    return r;
  },
});
