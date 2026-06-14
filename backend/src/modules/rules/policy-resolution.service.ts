import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { UsersRepository } from '../users/users.repository';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { PoliciesRepository } from './policies.repository';
import { ExtensionScope } from '../../interfaces';

/**
 * Resolves the EFFECTIVE policy for a user — the single source of truth for
 * "which policy governs this identity", shared by the YAML compiler (wrapper)
 * and the runtime evaluator.
 *
 * Resolution is intentionally NOT cached: it is two cheap indexed point-reads
 * and the result (which id is the fallback) must reflect policy activation in
 * real time. The policy CONTENT is what gets cached, keyed by policy id.
 */
@Injectable()
export class PolicyResolutionService {
  constructor(
    private readonly users: UsersRepository,
    private readonly profiles: ProfilesRepository,
    private readonly policies: PoliciesRepository,
  ) {}

  /**
   * Precedence:
   *   1. user.policyId            — policy assigned directly to the user
   *   2. user.profileId.policyId  — policy carried by the user's profile
   *   3. globally-active policy   — fallback / back-compat
   * A referenced policy that no longer exists falls through to the next level
   * (a deleted policy must not break the wrapper). Returns null when nothing
   * applies; the caller decides the no-policy behaviour.
   */
  async resolveEffectivePolicyId(userId: string, scope: ExtensionScope = {}): Promise<string | null> {
    const user = await this.users.findById(userId, scope);
    if (user) {
      const directId = user.policyId ? String(user.policyId) : null;
      if (directId && (await this.policyExists(directId, scope))) return directId;

      if (user.profileId) {
        const profile = await this.profiles.findById(String(user.profileId), scope);
        const profilePolicyId = profile?.policyId ? String(profile.policyId) : null;
        if (profilePolicyId && (await this.policyExists(profilePolicyId, scope))) return profilePolicyId;
      }
    }

    const active = await this.policies.findActive(scope);
    return active ? this.idOf(active) : null;
  }

  private async policyExists(id: string, scope: ExtensionScope = {}): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    return !!(await this.policies.findById(id, scope));
  }

  private idOf(doc: unknown): string {
    return String((doc as { _id: Types.ObjectId })._id);
  }
}
