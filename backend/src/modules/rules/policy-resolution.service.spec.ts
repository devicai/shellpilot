import { Types } from 'mongoose';
import { PolicyResolutionService } from './policy-resolution.service';

// Valid 24-hex ObjectId strings for the three policies under test.
const DIRECT = 'a'.repeat(24);
const PROFILE_POLICY = 'b'.repeat(24);
const GLOBAL = 'c'.repeat(24);
const PROFILE_ID = 'd'.repeat(24);

function makeService(opts: {
  user?: { policyId?: string; profileId?: string } | null;
  profilePolicyId?: string | null;
  existingPolicyIds?: string[];
  activeId?: string | null;
}) {
  const existing = new Set(opts.existingPolicyIds ?? []);
  const users = {
    findById: jest.fn().mockResolvedValue(
      opts.user
        ? {
            policyId: opts.user.policyId ? new Types.ObjectId(opts.user.policyId) : undefined,
            profileId: opts.user.profileId ? new Types.ObjectId(opts.user.profileId) : undefined,
          }
        : null,
    ),
  };
  const profiles = {
    findById: jest.fn().mockResolvedValue(
      opts.profilePolicyId !== undefined
        ? { policyId: opts.profilePolicyId ? new Types.ObjectId(opts.profilePolicyId) : undefined }
        : null,
    ),
  };
  const policies = {
    findById: jest.fn((id: string) => Promise.resolve(existing.has(id) ? { _id: new Types.ObjectId(id) } : null)),
    findActive: jest.fn().mockResolvedValue(opts.activeId ? { _id: new Types.ObjectId(opts.activeId) } : null),
  };
  const svc = new PolicyResolutionService(users as never, profiles as never, policies as never);
  return { svc, users, profiles, policies };
}

describe('PolicyResolutionService precedence', () => {
  it('1. direct user.policyId wins over profile and global', async () => {
    const { svc } = makeService({
      user: { policyId: DIRECT, profileId: PROFILE_ID },
      profilePolicyId: PROFILE_POLICY,
      existingPolicyIds: [DIRECT, PROFILE_POLICY],
      activeId: GLOBAL,
    });
    await expect(svc.resolveEffectivePolicyId('u1')).resolves.toBe(DIRECT);
  });

  it('2. deleted direct policy falls through to the profile policy', async () => {
    const { svc } = makeService({
      user: { policyId: DIRECT, profileId: PROFILE_ID },
      profilePolicyId: PROFILE_POLICY,
      existingPolicyIds: [PROFILE_POLICY], // DIRECT no longer exists
      activeId: GLOBAL,
    });
    await expect(svc.resolveEffectivePolicyId('u1')).resolves.toBe(PROFILE_POLICY);
  });

  it('3. no direct policy → profile policy', async () => {
    const { svc } = makeService({
      user: { profileId: PROFILE_ID },
      profilePolicyId: PROFILE_POLICY,
      existingPolicyIds: [PROFILE_POLICY],
      activeId: GLOBAL,
    });
    await expect(svc.resolveEffectivePolicyId('u2')).resolves.toBe(PROFILE_POLICY);
  });

  it('4. no direct, no profile policy → global active (fallback)', async () => {
    const { svc } = makeService({
      user: { profileId: PROFILE_ID },
      profilePolicyId: null,
      existingPolicyIds: [],
      activeId: GLOBAL,
    });
    await expect(svc.resolveEffectivePolicyId('u3')).resolves.toBe(GLOBAL);
  });

  it('5. nothing applies → null', async () => {
    const { svc } = makeService({ user: {}, activeId: null });
    await expect(svc.resolveEffectivePolicyId('u4')).resolves.toBeNull();
  });
});
