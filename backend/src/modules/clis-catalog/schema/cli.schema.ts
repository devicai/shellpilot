import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CliEnforcement = 'enforce' | 'warn' | 'audit';
export const CLI_ENFORCEMENT: CliEnforcement[] = ['enforce', 'warn', 'audit'];

export type CliDocument = HydratedDocument<Cli>;

@Schema({ _id: false })
class InstallCommands {
  @Prop({ trim: true })
  mac?: string;

  @Prop({ trim: true })
  linux?: string;

  @Prop({ trim: true })
  windows?: string;
}

@Schema({ timestamps: true, collection: 'clis' })
export class Cli {
  @Prop({ required: true, unique: true, index: true, lowercase: true, trim: true })
  slug!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  vendor?: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ trim: true })
  envVarHint?: string;

  @Prop({ enum: CLI_ENFORCEMENT, default: 'warn' })
  defaultEnforcement!: CliEnforcement;

  @Prop({ type: InstallCommands, default: {} })
  installCommands!: InstallCommands;

  @Prop({ trim: true })
  docsUrl?: string;

  @Prop({ trim: true })
  icon?: string;

  @Prop({ trim: true })
  iconUrl?: string;

  @Prop({ default: true })
  active!: boolean;
}

export const CliSchema = SchemaFactory.createForClass(Cli);

CliSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    r.id = r._id;
    delete r._id;
    delete r.__v;
    return r;
  },
});
