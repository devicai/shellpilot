import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type CliEnforcement = 'enforce' | 'warn' | 'audit';
export const CLI_ENFORCEMENT: CliEnforcement[] = ['enforce', 'warn', 'audit'];

export type CliAuthMode = 'env' | 'env-multi' | 'file' | 'flag' | 'login-command' | 'none';
export const CLI_AUTH_MODES: CliAuthMode[] = [
  'env',
  'env-multi',
  'file',
  'flag',
  'login-command',
  'none',
];

export type CliFileFormat = 'raw' | 'json' | 'yaml';
export const CLI_FILE_FORMATS: CliFileFormat[] = ['raw', 'json', 'yaml'];

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

// Server-side step: enriches the JIT envelope with derived values (e.g.
// exchange OAuth refresh token for an access token). Generic primitive
// `kind`s declared by config — no CLI-specific code in the backend.
export interface PostProcessStep {
  kind: string; // 'http-form-post' for now; future: 'jwt-exchange', ...
  [key: string]: unknown;
}

// Client-side step: tells the wrapper how to expose a value to the child
// process. Primitives are CLI-agnostic.
export interface DeliveryStep {
  kind: string; // 'file' | 'env' | 'env-file' | 'flag'
  [key: string]: unknown;
}

// Either a plain string (same path on all OSes) or a per-OS object. The
// wrapper picks `obj[runtime.GOOS]` (via a short OS→key map) at delivery time.
export type OsPath = string | { mac?: string; linux?: string; windows?: string };

@Schema({ _id: false })
class CliAuth {
  @Prop({ enum: CLI_AUTH_MODES, default: 'env', required: true })
  mode!: CliAuthMode;

  @Prop({ trim: true })
  envVar?: string;

  @Prop({ type: [String], default: undefined })
  envVars?: string[];

  // Mongoose typed as Mixed: callers receive `OsPath` and must accept both.
  @Prop({ type: SchemaTypes.Mixed })
  filePath?: OsPath;

  @Prop({ enum: CLI_FILE_FORMATS })
  fileFormat?: CliFileFormat;

  @Prop({ trim: true })
  flag?: string;

  @Prop({ trim: true })
  loginCommand?: string;

  @Prop({ type: [SchemaTypes.Mixed], default: undefined })
  postProcess?: PostProcessStep[];

  @Prop({ type: [SchemaTypes.Mixed], default: undefined })
  delivery?: DeliveryStep[];
}

// Provenance for entries imported from the public catalog registry. Lets the
// UI show where an entry came from and detect when a newer version is available
// upstream. Absent on entries created/edited locally.
@Schema({ _id: false })
export class CliSource {
  @Prop({ trim: true })
  origin?: string; // 'registry'

  @Prop({ trim: true })
  repo?: string; // 'devicai/shellpilot' or a local mirror path

  @Prop({ trim: true })
  ref?: string; // 'main'

  @Prop({ trim: true })
  path?: string; // 'catalog/clis/gcloud.yml'

  @Prop()
  version?: number; // registry entry version at import time

  @Prop({ trim: true })
  sha?: string; // git blob sha at import time (github source only)

  @Prop()
  importedAt?: Date;
}

@Schema({ timestamps: true, collection: 'clis' })
export class Cli {
  // Unique per tenant — not globally. The scoped unique index is applied at boot
  // (app.module via applyScopedUniqueIndex), so the same slug can exist once per
  // clientUID. A plain global `unique: true` here would break multi-tenancy.
  @Prop({ required: true, lowercase: true, trim: true })
  slug!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  vendor?: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: CliAuth, default: () => ({ mode: 'env' }) })
  auth!: CliAuth;

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

  @Prop({ type: CliSource, default: undefined })
  source?: CliSource;
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
