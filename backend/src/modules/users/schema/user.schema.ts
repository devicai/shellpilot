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

  @Prop({ required: true })
  passwordHash!: string;

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
