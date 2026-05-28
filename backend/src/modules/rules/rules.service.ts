import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PoliciesRepository } from './policies.repository';
import { RulesRepository } from './rules.repository';
import { Policy } from './schema/policy.schema';
import { Rule } from './schema/rule.schema';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { ExtensionScope, PaginatedResponse } from '../../interfaces';
import { PolicyEvaluatorService } from './evaluator/policy-evaluator.service';

@Injectable()
export class RulesService {
  constructor(
    private readonly policies: PoliciesRepository,
    private readonly rules: RulesRepository,
    private readonly evaluator: PolicyEvaluatorService,
  ) {}

  // ---- Policies ----

  async listPolicies(
    scope: ExtensionScope,
    opts: { limit?: number; offset?: number },
    ownerUserId?: string,
  ): Promise<PaginatedResponse<Policy>> {
    // Default: only shared policies (linked to profiles / global fallback);
    // per-user individual rules (ownerUserId set) are excluded.
    // With ownerUserId: return THAT user's individual policies — used by the
    // user detail page to reactivate existing individual rules rather than
    // creating duplicates each time the user switches modes.
    if (ownerUserId) {
      if (!Types.ObjectId.isValid(ownerUserId)) {
        return { data: [], pagination: { total: 0, limit: opts.limit ?? 20, offset: opts.offset ?? 0, hasMore: false } };
      }
      return this.policies.find({ ownerUserId: new Types.ObjectId(ownerUserId) }, scope, opts);
    }
    return this.policies.find({ ownerUserId: { $exists: false } }, scope, opts);
  }

  async getPolicy(id: string, scope: ExtensionScope): Promise<Policy> {
    const p = await this.policies.findById(id, scope);
    if (!p) throw new NotFoundException('Policy not found');
    return p;
  }

  async createPolicy(dto: CreatePolicyDto, scope: ExtensionScope): Promise<Policy> {
    // An individual (owner-scoped) policy is never the global fallback.
    const owned = Boolean(dto.ownerUserId);
    const policy = (await this.policies.create(
      {
        name: dto.name,
        description: dto.description,
        defaultEffect: dto.defaultEffect ?? 'deny',
        enforcement: dto.enforcement ?? 'warn',
        clis: dto.clis ?? [],
        webhooks: dto.webhooks ?? {},
        webhookSecret: dto.webhookSecret,
        active: owned ? false : (dto.active ?? false),
        version: 1,
        ...(owned ? { ownerUserId: new Types.ObjectId(dto.ownerUserId) } : {}),
      } as Partial<Policy>,
      scope,
    )) as Policy & { _id: Types.ObjectId };
    // Activation needs no cache bust: content is cached per id and a fresh
    // policy isn't cached yet; the fallback id is resolved live.
    if (policy.active) {
      await this.policies.deactivateOthers(String(policy._id));
    }
    return policy;
  }

  async updatePolicy(id: string, dto: UpdatePolicyDto, scope: ExtensionScope): Promise<Policy> {
    const current = (await this.policies.findById(id, scope)) as (Policy & { _id: Types.ObjectId; version: number }) | null;
    if (!current) throw new NotFoundException('Policy not found');
    const updated = (await this.policies.updateById(
      id,
      { ...dto, version: current.version + 1 } as Partial<Policy>,
      scope,
    )) as Policy & { _id: Types.ObjectId; active: boolean };
    if (updated.active) {
      await this.policies.deactivateOthers(String(updated._id));
    }
    // Content (metadata/clis) changed → bust this policy's cached content.
    await this.evaluator.invalidatePolicy(id);
    return updated;
  }

  async activatePolicy(id: string, scope: ExtensionScope): Promise<Policy> {
    const updated = (await this.policies.updateById(id, { active: true }, scope)) as (Policy & { _id: Types.ObjectId }) | null;
    if (!updated) throw new NotFoundException('Policy not found');
    await this.policies.deactivateOthers(String(updated._id));
    // No cache bust: activation only changes which id is the fallback (resolved
    // live); the policy's cached content is unchanged.
    return updated;
  }

  async deletePolicy(id: string, scope: ExtensionScope): Promise<void> {
    const ok = await this.policies.deleteById(id, scope);
    if (!ok) throw new NotFoundException('Policy not found');
    await this.rules.deleteByPolicy(id);
    await this.evaluator.invalidatePolicy(id);
  }

  // ---- Rules ----

  async listRules(policyId: string): Promise<Rule[]> {
    return this.rules.findByPolicy(policyId);
  }

  async createRule(policyId: string, dto: CreateRuleDto, scope: ExtensionScope): Promise<Rule> {
    const policy = await this.policies.findById(policyId, scope);
    if (!policy) throw new NotFoundException('Policy not found');
    const rule = await this.rules.create(
      {
        policyId: new Types.ObjectId(policyId),
        cli: dto.cli.toLowerCase(),
        path: dto.path.trim(),
        effect: dto.effect,
        reason: dto.reason,
        priority: dto.priority ?? 0,
      } as Partial<Rule>,
      scope,
    );
    await this.evaluator.invalidatePolicy(policyId);
    return rule;
  }

  async updateRule(id: string, dto: UpdateRuleDto, scope: ExtensionScope): Promise<Rule> {
    const update: Partial<Rule> = { ...dto };
    if (dto.cli) update.cli = dto.cli.toLowerCase();
    if (dto.path) update.path = dto.path.trim();
    const updated = (await this.rules.updateById(id, update, scope)) as (Rule & { policyId: Types.ObjectId }) | null;
    if (!updated) throw new NotFoundException('Rule not found');
    await this.evaluator.invalidatePolicy(String(updated.policyId));
    return updated;
  }

  async deleteRule(id: string, scope: ExtensionScope): Promise<void> {
    // Read the rule first so we know which policy's cache to bust.
    const rule = (await this.rules.findById(id, scope)) as (Rule & { policyId: Types.ObjectId }) | null;
    const ok = await this.rules.deleteById(id, scope);
    if (!ok) throw new NotFoundException('Rule not found');
    if (rule) await this.evaluator.invalidatePolicy(String(rule.policyId));
  }
}
