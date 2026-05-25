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

  async listPolicies(scope: ExtensionScope, opts: { limit?: number; offset?: number }): Promise<PaginatedResponse<Policy>> {
    return this.policies.find({}, scope, opts);
  }

  async getPolicy(id: string, scope: ExtensionScope): Promise<Policy> {
    const p = await this.policies.findById(id, scope);
    if (!p) throw new NotFoundException('Policy not found');
    return p;
  }

  async createPolicy(dto: CreatePolicyDto, scope: ExtensionScope): Promise<Policy> {
    const policy = (await this.policies.create(
      {
        name: dto.name,
        description: dto.description,
        defaultEffect: dto.defaultEffect ?? 'deny',
        enforcement: dto.enforcement ?? 'warn',
        clis: dto.clis ?? [],
        webhooks: dto.webhooks ?? {},
        webhookSecret: dto.webhookSecret,
        active: dto.active ?? false,
        version: 1,
      } as Partial<Policy>,
      scope,
    )) as Policy & { _id: Types.ObjectId };
    if (policy.active) {
      await this.policies.deactivateOthers(String(policy._id));
      await this.evaluator.invalidateCache();
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
    await this.evaluator.invalidateCache();
    return updated;
  }

  async activatePolicy(id: string, scope: ExtensionScope): Promise<Policy> {
    const updated = (await this.policies.updateById(id, { active: true }, scope)) as (Policy & { _id: Types.ObjectId }) | null;
    if (!updated) throw new NotFoundException('Policy not found');
    await this.policies.deactivateOthers(String(updated._id));
    await this.evaluator.invalidateCache();
    return updated;
  }

  async deletePolicy(id: string, scope: ExtensionScope): Promise<void> {
    const ok = await this.policies.deleteById(id, scope);
    if (!ok) throw new NotFoundException('Policy not found');
    await this.rules.deleteByPolicy(id);
    await this.evaluator.invalidateCache();
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
    await this.evaluator.invalidateCache();
    return rule;
  }

  async updateRule(id: string, dto: UpdateRuleDto, scope: ExtensionScope): Promise<Rule> {
    const update: Partial<Rule> = { ...dto };
    if (dto.cli) update.cli = dto.cli.toLowerCase();
    if (dto.path) update.path = dto.path.trim();
    const updated = await this.rules.updateById(id, update, scope);
    if (!updated) throw new NotFoundException('Rule not found');
    await this.evaluator.invalidateCache();
    return updated;
  }

  async deleteRule(id: string, scope: ExtensionScope): Promise<void> {
    const ok = await this.rules.deleteById(id, scope);
    if (!ok) throw new NotFoundException('Rule not found');
    await this.evaluator.invalidateCache();
  }
}
