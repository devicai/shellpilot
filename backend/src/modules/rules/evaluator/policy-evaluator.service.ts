import { Inject, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import { CONFIG } from '../../../config/config.loader';
import { ShellpilotModuleConfig } from '../../../config/config.types';
import { PoliciesRepository } from '../policies.repository';
import { RulesRepository } from '../rules.repository';
import { Decision, Enforcement, Policy } from '../schema/policy.schema';
import { Rule } from '../schema/rule.schema';

const POLICY_CACHE_KEY = 'shellpilot:policy:active';
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
    private readonly redis: RedisService,
    @Inject(CONFIG) private readonly config: ShellpilotModuleConfig,
  ) {}

  async invalidateCache(): Promise<void> {
    await this.redis.del(POLICY_CACHE_KEY);
  }

  private async loadActivePolicy(): Promise<CachedPolicy | null> {
    const cached = await this.redis.get(POLICY_CACHE_KEY);
    if (cached) return JSON.parse(cached) as CachedPolicy;

    const policy = (await this.policies.findActive()) as (Policy & { _id: { toString(): string } }) | null;
    if (!policy) return null;
    const rules = (await this.rulesRepo.findByPolicy(String(policy._id))) as Array<Rule & { _id: { toString(): string } }>;
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
    await this.redis.setex(POLICY_CACHE_KEY, POLICY_CACHE_TTL, JSON.stringify(payload));
    return payload;
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

  async evaluate(cli: string, args: string[], policyOverrideId?: string): Promise<EvaluationResult> {
    let cached: CachedPolicy | null;
    if (policyOverrideId) {
      const policy = (await this.policies.findById(policyOverrideId, {})) as (Policy & { _id: { toString(): string } }) | null;
      if (!policy) {
        return {
          decision: this.config.shellpilot.defaultEnforcement === 'enforce' ? 'deny' : 'allow',
          enforcement: this.config.shellpilot.defaultEnforcement,
          policy: { id: '', name: 'no-policy', version: 0 },
        };
      }
      const rules = (await this.rulesRepo.findByPolicy(String(policy._id))) as Array<Rule & { _id: { toString(): string } }>;
      cached = {
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
    } else {
      cached = await this.loadActivePolicy();
    }

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
