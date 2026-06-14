import { ExtensionProperty } from '../../config/config.types';
import { ExtensionScope } from '../../interfaces';

/**
 * Derives the extension scope carried by an authenticated principal (an API key
 * document or a user document). For each configured extension property, copies the
 * value off the principal when present.
 *
 * This is what ties an authenticated request's tenant to its identity: a principal
 * that carries the extension value (e.g. clientUID) is pinned to that tenant and
 * cannot be widened via a request header. A principal WITHOUT the value is treated
 * as global/cross-tenant and lets the header supply the scope (used by internal
 * service callers). Fully generic — works for any extension, not just clientUID.
 */
export function deriveAuthScope(principal: unknown, extensions: ExtensionProperty[]): ExtensionScope {
  const scope: ExtensionScope = {};
  if (!principal || typeof principal !== 'object') return scope;
  const record = principal as Record<string, unknown>;
  for (const ext of extensions) {
    const value = record[ext.name];
    if (value !== undefined && value !== null && value !== '') {
      scope[ext.name] = String(value);
    }
  }
  return scope;
}
