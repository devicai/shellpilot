import { Inject, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import { CONFIG } from '../../../config/config.loader';
import { ShellpilotModuleConfig } from '../../../config/config.types';
import { ExtensionScope } from '../../../interfaces';
import { PoliciesRepository } from '../policies.repository';
import { RulesRepository } from '../rules.repository';
import { PolicyResolutionService } from '../policy-resolution.service';
import { Decision, Enforcement, Policy } from '../schema/policy.schema';
import { Rule } from '../schema/rule.schema';

// Policy CONTENT is cached per policy id. Resolution (which id applies to a
// given identity) is intentionally NOT cached — see PolicyResolutionService.
// Consequence: activating a policy needs NO cache bust (content is unchanged;
// only the fallback id changes, and that is resolved live). Only content edits
// (updatePolicy / rule CRUD) invalidate a specific id.
const POLICY_CACHE_PREFIX = 'shellpilot:policy:byId:';
const POLICY_CACHE_TTL = 300;

export interface EvaluationResult {
  decision: Decision;
  enforcement: Enforcement;
  matchedRule?: {
    id: string;
    cli: string;
    path: string;
    effect: Decision;
    reason?: string;
    priority: number;
  };
  policy: { id: string; name: string; version: number };
}

interface CachedPolicy {
  id: string;
  name: string;
  version: number;
  defaultEffect: Decision;
  enforcement: Enforcement;
  rules: Array<{
    id: string;
    cli: string;
    path: string;
    effect: Decision;
    reason?: string;
    priority: number;
  }>;
}

@Injectable()
export class PolicyEvaluatorService {
  private readonly logger = new Logger(PolicyEvaluatorService.name);

  constructor(
    private readonly policies: PoliciesRepository,
    private readonly rulesRepo: RulesRepository,
    private readonly resolution: PolicyResolutionService,
    private readonly redis: RedisService,
    @Inject(CONFIG) private readonly config: ShellpilotModuleConfig,
  ) {}

  /** Bust the cached content of a single policy (call on policy/rule edits). */
  async invalidatePolicy(policyId: string): Promise<void> {
    await this.redis.del(POLICY_CACHE_PREFIX + policyId);
  }

  private async loadPolicyById(policyId: string, scope: ExtensionScope): Promise<CachedPolicy | null> {
    const key = POLICY_CACHE_PREFIX + policyId;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached) as CachedPolicy;

    const policy = (await this.policies.findById(policyId, scope)) as (Policy & { _id: { toString(): string } }) | null;
    if (!policy) return null;
    const rules = (await this.rulesRepo.findByPolicy(String(policy._id), scope)) as Array<Rule & { _id: { toString(): string } }>;
    const payload: CachedPolicy = {
      id: String(policy._id),
      name: policy.name,
      version: policy.version,
      defaultEffect: policy.defaultEffect,
      enforcement: policy.enforcement,
      rules: rules.map((r) => ({
        id: String(r._id),
        cli: r.cli,
        path: r.path,
        effect: r.effect,
        reason: r.reason,
        priority: r.priority,
      })),
    };
    await this.redis.setex(key, POLICY_CACHE_TTL, JSON.stringify(payload));
    return payload;
  }

  /**
   * Which policy applies: explicit override (admin/testing) → the user's
   * effective policy (per-identity) → the globally-active policy.
   */
  private async resolvePolicyId(
    opts: { userId?: string; policyOverrideId?: string },
    scope: ExtensionScope,
  ): Promise<string | null> {
    // Validate an explicit override against the tenant so it can't reference (or
    // hit the cached content of) another tenant's policy.
    if (opts.policyOverrideId) {
      const p = (await this.policies.findById(opts.policyOverrideId, scope)) as (Policy & { _id: { toString(): string } }) | null;
      return p ? String(p._id) : null;
    }
    if (opts.userId) return this.resolution.resolveEffectivePolicyId(opts.userId, scope);
    const active = (await this.policies.findActive(scope)) as (Policy & { _id: { toString(): string } }) | null;
    return active ? String(active._id) : null;
  }

  private matchPath(rulePath: string, args: string[]): { matches: boolean; specificity: number } {
    const segments = rulePath.split(/\s+/).filter(Boolean);
    let specificity = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg === '*') continue;
      if (seg === '**') return { matches: true, specificity };
      const arg = args[i];
      if (arg === undefined) return { matches: false, specificity: 0 };
      if (seg === arg) {
        specificity += 1;
        continue;
      }
      return { matches: false, specificity: 0 };
    }
    return { matches: true, specificity };
  }

  async evaluate(
    cli: string,
    args: string[],
    opts: { userId?: string; policyOverrideId?: string } = {},
    scope: ExtensionScope = {},
  ): Promise<EvaluationResult> {
    const policyId = await this.resolvePolicyId(opts, scope);
    const cached = policyId ? await this.loadPolicyById(policyId, scope) : null;

    if (!cached) {
      return {
        decision: this.config.shellpilot.defaultEnforcement === 'enforce' ? 'deny' : 'allow',
        enforcement: this.config.shellpilot.defaultEnforcement,
        policy: { id: '', name: 'no-policy', version: 0 },
      };
    }

    const cliLower = cli.toLowerCase();
    const candidates = cached.rules.filter((r) => r.cli === cliLower || r.cli === '*');

    let best: { rule: CachedPolicy['rules'][number]; specificity: number } | null = null;
    for (const rule of candidates) {
      const m = this.matchPath(rule.path, args);
      if (!m.matches) continue;
      if (!best || rule.priority > best.rule.priority || (rule.priority === best.rule.priority && m.specificity > best.specificity)) {
        best = { rule, specificity: m.specificity };
      }
    }

    if (!best) {
      return {
        decision: cached.defaultEffect,
        enforcement: cached.enforcement,
        policy: { id: cached.id, name: cached.name, version: cached.version },
      };
    }

    return {
      decision: best.rule.effect,
      enforcement: cached.enforcement,
      matchedRule: best.rule,
      policy: { id: cached.id, name: cached.name, version: cached.version },
    };
  }
}
