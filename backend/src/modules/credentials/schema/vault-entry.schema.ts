import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { CLI_AUTH_MODES, CliAuthMode, OsPath } from '../../clis-catalog/schema/cli.schema';

export type VaultEntryDocument = HydratedDocument<VaultEntry>;

@Schema({ timestamps: true, collection: 'vault_entries' })
export class VaultEntry {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  cli!: string;

  @Prop({ enum: CLI_AUTH_MODES, required: true })
  mode!: CliAuthMode;

  @Prop({ trim: true })
  envVar?: string;

  @Prop({ type: [String], default: undefined })
  envVars?: string[];

  @Prop({ type: SchemaTypes.Mixed })
  filePath?: OsPath;

  @Prop({ trim: true })
  fileFormat?: string;

  @Prop({ trim: true })
  flag?: string;

  @Prop({ required: true })
  envelopeCiphertext!: string;

  @Prop({ required: true })
  envelopeIv!: string;

  @Prop({ required: true })
  envelopeTag!: string;
}

export const VaultEntrySchema = SchemaFactory.createForClass(VaultEntry);
VaultEntrySchema.index({ userId: 1, cli: 1 }, { unique: true });

VaultEntrySchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    delete r.envelopeCiphertext;
    delete r.envelopeIv;
    delete r.envelopeTag;
    r.id = r._id;
    delete r._id;
    delete r.__v;
    return r;
  },
});
