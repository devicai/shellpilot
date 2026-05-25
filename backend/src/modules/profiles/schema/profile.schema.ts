import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type ProfileDocument = HydratedDocument<Profile>;

// A Profile is a department-style template: a name + the CLIs that
// department's users are allowed to touch + the policy that governs them +
// a list of credential references the org provisions for that department.
// The wrapper never sees Profiles directly — the backend resolves them from
// the user that's calling, so admins can re-shape a department's surface
// without touching any workstation.
@Schema({ timestamps: true, collection: 'profiles' })
export class Profile {
  @Prop({ required: true, unique: true, index: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  // Slug whitelist. /credentials/issue refuses cli not in this list when the
  // requesting user has this profile assigned.
  @Prop({ type: [String], default: [] })
  clis!: string[];

  // Reference to the Policy that governs this profile. If null, the wrapper
  // falls back to the globally-active policy (legacy behaviour).
  @Prop({ type: Types.ObjectId, ref: 'Policy' })
  policyId?: Types.ObjectId;

  // Optional credentials shared by every user with this profile (e.g. a
  // team-wide gcloud sandbox account). Each entry is `{cli, payload}` — the
  // payload mirrors StoreCredentialDto's shape. At /credentials/issue time
  // the backend prefers the user's own VaultEntry; if absent, it falls back
  // to the profile default. v1 keeps this opaque to ease iteration.
  @Prop({ type: [SchemaTypes.Mixed], default: undefined })
  defaultCredentials?: Array<{ cli: string; payload: Record<string, unknown> }>;

  @Prop({ default: true })
  active!: boolean;
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);

ProfileSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    r.id = r._id;
    delete r._id;
    delete r.__v;
    return r;
  },
});
