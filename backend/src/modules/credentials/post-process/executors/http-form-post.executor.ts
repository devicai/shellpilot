import { BadRequestException } from '@nestjs/common';
import { ResolverContext, resolveRecord, resolveReference } from '../path-resolver';
import type { PostProcessExecutor, ExecuteResult } from './executor.interface';

interface HttpFormPostStep {
  kind: 'http-form-post';
  url: string;                                  // may contain $vault/$extras refs
  headers?: Record<string, string>;             // optional, values templated
  bodyFrom?: Record<string, unknown>;           // form fields, values templated
  extractTo?: Record<string, string>;           // output name → $response.path
}

// Generic OAuth/form-style token exchange. Sends application/x-www-form-urlencoded,
// expects JSON back, extracts named outputs into `extras`.
export const httpFormPostExecutor: PostProcessExecutor = {
  kind: 'http-form-post',
  async execute(step: Record<string, unknown>, ctx: ResolverContext): Promise<ExecuteResult> {
    const cfg = step as unknown as HttpFormPostStep;
    const url = resolveReference(cfg.url, ctx);
    if (typeof url !== 'string' || !url) {
      throw new BadRequestException('http-form-post: url is required');
    }
    const body = resolveRecord(cfg.bodyFrom, ctx);
    const headers = resolveRecord(cfg.headers, ctx) as Record<string, string>;

    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v == null) continue;
      form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...headers,
      },
      body: form.toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new BadRequestException(`http-form-post: ${res.status} ${text.slice(0, 200)}`);
    }
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('http-form-post: response was not JSON');
    }

    const stepCtx: ResolverContext = { ...ctx, response: parsed };
    const extrasAdditions: Record<string, unknown> = {};
    for (const [outName, ref] of Object.entries(cfg.extractTo ?? {})) {
      extrasAdditions[outName] = resolveReference(ref, stepCtx);
    }
    return { extras: extrasAdditions };
  },
};
