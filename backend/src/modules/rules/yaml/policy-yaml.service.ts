import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as yaml from 'js-yaml';
import { PoliciesRepository } from '../policies.repository';
import { RulesRepository } from '../rules.repository';
import { PolicyResolutionService } from '../policy-resolution.service';
import { Cli } from '../../clis-catalog/schema/cli.schema';
import { Policy } from '../schema/policy.schema';
import { Rule } from '../schema/rule.schema';
import { ExtensionScope } from '../../../interfaces';

/**
 * Compiles a policy + matching CLI catalog entries into the YAML shape the Go
 * wrapper expects (see prototype/config.go — Config struct). The wrapper fetches
 * this once per cache TTL and evaluates everything locally. Which policy a given
 * API key gets is resolved per-user (PolicyResolutionService).
 */
@Injectable()
export class PolicyYamlService {
  constructor(
    private readonly policies: PoliciesRepository,
    private readonly rules: RulesRepository,
    private readonly resolution: PolicyResolutionService,
    @InjectModel(Cli.name) private readonly cliModel: Model<Cli>,
  ) {}

  /** Compile the effective policy for a user (direct → profile → global active). */
  async compileEffectivePolicyYamlForUser(userId: string, scope: ExtensionScope = {}): Promise<string> {
    const policyId = await this.resolution.resolveEffectivePolicyId(userId, scope);
    if (!policyId) {
      throw new NotFoundException('No effective policy for this identity');
    }
    return this.compilePolicyYaml(policyId, scope);
  }

  /** Compile the globally-active policy (no user context). */
  async compileActivePolicyYaml(scope: ExtensionScope = {}): Promise<string> {
    const policy = (await this.policies.findActive(scope)) as (Policy & { _id: { toString(): string } }) | null;
    if (!policy) {
      throw new NotFoundException('No active policy configured');
    }
    return this.compilePolicyYaml(policy._id.toString(), scope);
  }

  async compilePolicyYaml(policyId: string, scope: ExtensionScope = {}): Promise<string> {
    const policy = (await this.policies.findById(policyId, scope)) as Policy | null;
    if (!policy) {
      throw new NotFoundException('Policy not found');
    }
    const rules = await this.rules.findByPolicy(policyId, scope);
    // Compile catalog entries for the policy's declared CLIs plus any CLI a
    // rule references. Auto-generated policies (e.g. "Individual rules — …")
    // carry an empty `clis` array, so without the union the wrapper would get
    // rules for a CLI but no install/auth block for it.
    const slugs = new Set<string>(policy.clis ?? []);
    for (const r of rules) if (r.cli) slugs.add(r.cli);
    const clis = await this.loadCliCatalog([...slugs], scope);

    const doc = {
      default_effect: policy.defaultEffect,
      enforcement: this.mapEnforcement(policy.enforcement),
      clis,
      rules: this.mapRules(rules),
    };

    return yaml.dump(doc, { lineWidth: 120, noRefs: true, sortKeys: false });
  }

  private mapEnforcement(enforcement: 'enforce' | 'warn' | 'audit'): Record<string, string> {
    // The Go wrapper expects a behaviour-oriented enforcement block
    // (missing_credential / backend_unreachable / offline_credentials) and the
    // backend stores a single policy-wide "mode". Map conservatively:
    //
    //   enforce → strict everywhere
    //   warn    → warn + graceful (default, friendly)
    //   audit   → warn + graceful + offline disabled (visibility only)
    if (enforcement === 'enforce') {
      return {
        missing_credential: 'block',
        backend_unreachable: 'strict',
        offline_credentials: 'disabled',
      };
    }
    return {
      missing_credential: 'warn',
      backend_unreachable: 'graceful',
      offline_credentials: 'disabled',
    };
  }

  private async loadCliCatalog(
    slugs: string[],
    scope: ExtensionScope = {},
  ): Promise<Record<string, unknown>> {
    if (!slugs.length) return {};
    // Scope-aware: only the requesting tenant's catalog entries are compiled.
    const docs = await this.cliModel.find({ slug: { $in: slugs }, active: true, ...scope }).lean().exec();
    const out: Record<string, unknown> = {};
    for (const c of docs) {
      const install = c.installCommands ?? {};
      out[c.slug] = {
        install: {
          darwin: install.mac ?? '',
          linux: install.linux ?? '',
          windows: install.windows ?? '',
        },
        uninstall: {
          darwin: '',
          linux: '',
          windows: '',
        },
        auth: this.encodeAuthYaml(c.auth),
        docs: c.docsUrl ?? '',
      };
    }
    return out;
  }

  private encodeAuthYaml(auth?: Cli['auth']): Record<string, unknown> {
    if (!auth || !auth.mode || auth.mode === 'none') return { mode: '', env_var: '' };
    const out: Record<string, unknown> = { mode: auth.mode };
    if (auth.envVar) out.env_var = auth.envVar;
    if (auth.envVars && auth.envVars.length) out.env_vars = auth.envVars;
    if (auth.filePath) out.file_path = auth.filePath;
    if (auth.fileFormat) out.file_format = auth.fileFormat;
    if (auth.flag) out.flag = auth.flag;
    if (auth.loginCommand) out.login_command = auth.loginCommand;
    return out;
  }

  private mapRules(rules: Rule[]): Array<Record<string, string>> {
    return rules.map((r) => {
      const cliPrefix = r.cli && !r.path.startsWith(r.cli + ' ') && !r.path.startsWith('* ')
        ? `${r.cli} `
        : '';
      const out: Record<string, string> = {
        path: `${cliPrefix}${r.path}`.trim(),
        effect: r.effect,
      };
      if (r.reason) out.reason = r.reason;
      return out;
    });
  }
}
