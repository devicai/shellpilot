import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as yaml from 'js-yaml';
import { PoliciesRepository } from '../policies.repository';
import { RulesRepository } from '../rules.repository';
import { Cli } from '../../clis-catalog/schema/cli.schema';
import { Policy } from '../schema/policy.schema';
import { Rule } from '../schema/rule.schema';

/**
 * Compiles the active policy + matching CLI catalog entries into the YAML shape
 * the Go wrapper expects (see prototype/config.go — Config struct). The wrapper
 * fetches this once per cache TTL and evaluates everything locally.
 */
@Injectable()
export class PolicyYamlService {
  constructor(
    private readonly policies: PoliciesRepository,
    private readonly rules: RulesRepository,
    @InjectModel(Cli.name) private readonly cliModel: Model<Cli>,
  ) {}

  async compileActivePolicyYaml(): Promise<string> {
    const policy = (await this.policies.findActive()) as (Policy & { _id: { toString(): string } }) | null;
    if (!policy) {
      throw new NotFoundException('No active policy configured');
    }
    const policyId = policy._id.toString();
    const rules = await this.rules.findByPolicy(policyId);
    const clis = await this.loadCliCatalog(policy.clis ?? []);

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

  private async loadCliCatalog(slugs: string[]): Promise<Record<string, unknown>> {
    if (!slugs.length) return {};
    const docs = await this.cliModel.find({ slug: { $in: slugs }, active: true }).lean().exec();
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
        auth: c.envVarHint
          ? { mode: 'env', env_var: c.envVarHint }
          : { mode: '', env_var: '' },
        docs: c.docsUrl ?? '',
      };
    }
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
