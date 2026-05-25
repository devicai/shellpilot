import { BadRequestException, Injectable } from '@nestjs/common';
import { ResolverContext, vaultRootFromEnvelope } from './path-resolver';
import type { VaultEnvelope } from '../jit/jit-token.service';
import type { CliAuthMode, OsPath } from '../../clis-catalog/schema/cli.schema';
import type { PostProcessExecutor } from './executors/executor.interface';
import { httpFormPostExecutor } from './executors/http-form-post.executor';

// Registry of generic primitives. Adding a new primitive = one file +
// one line here. ShellPilot's core never references specific CLIs.
const REGISTRY: Record<string, PostProcessExecutor> = {
  [httpFormPostExecutor.kind]: httpFormPostExecutor,
};

export interface RunInput {
  envelope: VaultEnvelope;
  steps: Array<Record<string, unknown>>;
  // The CLI's auth config (minus secrets), exposed to steps as $auth.X.
  auth: {
    mode: CliAuthMode;
    envVar?: string;
    envVars?: string[];
    filePath?: OsPath;
    fileFormat?: string;
    flag?: string;
  };
}

@Injectable()
export class PostProcessService {
  async run(input: RunInput): Promise<Record<string, unknown>> {
    const extras: Record<string, unknown> = {};
    const ctx: ResolverContext = {
      vault: vaultRootFromEnvelope(input.envelope),
      extras,
      auth: input.auth as unknown as Record<string, unknown>,
    };
    for (const [i, step] of input.steps.entries()) {
      const kind = step?.kind as string | undefined;
      if (!kind) throw new BadRequestException(`postProcess[${i}]: missing 'kind'`);
      const exec = REGISTRY[kind];
      if (!exec) {
        throw new BadRequestException(`postProcess[${i}]: unknown kind '${kind}'`);
      }
      const result = await exec.execute(step, ctx);
      Object.assign(extras, result.extras);
    }
    return extras;
  }

  listKinds(): string[] {
    return Object.keys(REGISTRY);
  }
}
