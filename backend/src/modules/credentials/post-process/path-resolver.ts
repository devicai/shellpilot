// Resolves $-rooted dot-paths inside template strings. Used by post-process
// step configs (and mirrored client-side by the wrapper).
//
//   "$vault.refresh_token"       → context.vault.refresh_token
//   "$response.access_token"     → context.response.access_token
//   "$extras.accessToken"        → context.extras.accessToken
//   "$auth.filePath"             → context.auth.filePath
//   "$env.APPDATA"               → context.env.APPDATA (wrapper-side only)
//   "static literal"             → "static literal" (unchanged)
//
// Whole-string references return the raw value (string | number | boolean | object).
// Embedded references inside a longer string are substituted as their stringified form.

export interface ResolverContext {
  vault: Record<string, unknown>;
  extras: Record<string, unknown>;
  auth: Record<string, unknown>;
  response?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
}

const REF_RE = /^\$(vault|response|extras|auth|env)((?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)$/;

function getRoot(ctx: ResolverContext, root: string): unknown {
  switch (root) {
    case 'vault':
      return ctx.vault;
    case 'response':
      return ctx.response;
    case 'extras':
      return ctx.extras;
    case 'auth':
      return ctx.auth;
    case 'env':
      return ctx.env ?? {};
    default:
      return undefined;
  }
}

function navigate(obj: unknown, segments: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export function resolveReference(template: string, ctx: ResolverContext): unknown {
  const m = REF_RE.exec(template);
  if (!m) {
    // Allow embedded ${ref} substitutions only — keep the syntax narrow.
    return template.replace(
      /\$(vault|response|extras|auth|env)((?:\.[a-zA-Z_][a-zA-Z0-9_]*)+)/g,
      (_full, root, path) => {
        const segs = (path as string).split('.').filter(Boolean);
        const v = navigate(getRoot(ctx, root as string), segs);
        return v == null ? '' : String(v);
      },
    );
  }
  const root = m[1];
  const segs = (m[2] || '').split('.').filter(Boolean);
  return navigate(getRoot(ctx, root), segs);
}

export function resolveRecord(
  obj: Record<string, unknown> | undefined,
  ctx: ResolverContext,
): Record<string, unknown> {
  if (!obj) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out[k] = resolveReference(v, ctx);
    else if (Array.isArray(v)) out[k] = v.map((x) => (typeof x === 'string' ? resolveReference(x, ctx) : x));
    else if (v && typeof v === 'object') out[k] = resolveRecord(v as Record<string, unknown>, ctx);
    else out[k] = v;
  }
  return out;
}

// Builds the `vault` root of the resolver context from a stored envelope.
// For mode=file we auto-parse `content` if it looks like JSON so configs can
// say `$vault.refresh_token` instead of `$vault.content.refresh_token`.
export function vaultRootFromEnvelope(envelope: {
  secret?: string;
  values?: Record<string, string>;
  content?: string;
}): Record<string, unknown> {
  if (envelope.values) return { ...envelope.values, values: envelope.values };
  if (envelope.content !== undefined) {
    const trimmed = envelope.content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        return { ...parsed, content: envelope.content };
      } catch {
        // fall through — keep as opaque content
      }
    }
    return { content: envelope.content };
  }
  if (envelope.secret) return { secret: envelope.secret };
  return {};
}
