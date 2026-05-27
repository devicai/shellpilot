import { ResolverContext } from '../path-resolver';

export interface ExecuteResult {
  extras: Record<string, unknown>;
}

export interface PostProcessExecutor {
  kind: string;
  execute(step: Record<string, unknown>, ctx: ResolverContext): Promise<ExecuteResult>;
}
