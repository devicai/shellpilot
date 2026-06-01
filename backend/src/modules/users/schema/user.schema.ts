import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserRole = 'admin' | 'operator' | 'viewer';
export const USER_ROLES: UserRole[] = ['admin', 'operator', 'viewer'];

// 'human' = a person using the console; 'service' = a non-human identity for an
// agent or automation, authenticated via API key. Same entity, different intent.
export type UserType = 'human' | 'service';
export const USER_TYPES: UserType[] = ['human', 'service'];

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, unique: true, index: true, lowercase: true, trim: true })
  email!: string;

  // Optional: only `local` users have a password. Users provisioned by an
  // external identity provider (external-jwt) and service accounts authenticate
  // without one, so password login is impossible for them by construction.
  @Prop()
  passwordHash?: string;

  // Stable identifier of this principal at an external identity provider (the
  // claim configured in auth.providers.externalJwt.claimMapping.externalUserId),
  // or the id of the consuming entity for a service account. Absent for purely
  // local users. Unique per tenant — see the partial index applied at boot
  // alongside the clientUID-style scope extensions (applyExternalIdentityIndex).
  @Prop({ trim: true })
  externalUserId?: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, enum: USER_ROLES, default: 'viewer' })
  role!: UserRole;

  @Prop({ required: true, enum: USER_TYPES, default: 'human' })
  type!: UserType;

  // Policy assigned directly to this user. Highest precedence when resolving the
  // effective policy for the wrapper (see PolicyResolutionService): direct
  // policyId → profile.policyId → globally-active policy.
  @Prop({ type: Types.ObjectId, ref: 'Policy', index: true })
  policyId?: Types.ObjectId;

  // Department-style template that bundles allowed CLIs + policy + default
  // credentials. When set, /credentials/issue and /rules/evaluate consult
  // the profile instead of falling back to the globally-active policy.
  @Prop({ type: Types.ObjectId, ref: 'Profile', index: true })
  profileId?: Types.ObjectId;

  @Prop({ default: true })
  active!: boolean;

  @Prop()
  lastLoginAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const r = ret as unknown as Record<string, unknown>;
    delete r.passwordHash;
    r.id = r._id;
    delete r._id;
    delete r.__v;
    return r;
  },
});
