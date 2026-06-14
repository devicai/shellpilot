import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import { AuthProvidersConfig, CliLoginConfig, ShellpilotModuleConfig } from './config.types';

/**
 * Fills auth provider + CLI-login defaults. Pure (no IO) so it stays unit-testable
 * and guarantees that a config WITHOUT these blocks behaves exactly like before:
 * `local` enabled, `external-jwt` disabled, CLI login served locally.
 */
export function resolveAuthProviders(rawAuth: unknown): {
  providers: AuthProvidersConfig;
  cliLogin: CliLoginConfig;
} {
  const auth = (rawAuth ?? {}) as Record<string, any>;
  const providersRaw = (auth.providers ?? {}) as Record<string, any>;
  const externalRaw = (providersRaw.externalJwt ?? {}) as Record<string, any>;
  const claimRaw = (externalRaw.claimMapping ?? {}) as Record<string, any>;
  const cliLoginRaw = (auth.cliLogin ?? {}) as Record<string, any>;

  const externalEnabled = externalRaw.enabled === true;
  if (externalEnabled && (!externalRaw.jwksUri || !externalRaw.issuer)) {
    throw new Error(
      'auth.providers.externalJwt is enabled but missing jwksUri and/or issuer. ' +
        'Both are required to validate external tokens.',
    );
  }

  return {
    providers: {
      local: { enabled: providersRaw.local?.enabled ?? true },
      externalJwt: {
        enabled: externalEnabled,
        jwksUri: externalRaw.jwksUri || undefined,
        issuer: externalRaw.issuer || undefined,
        audience: externalRaw.audience || undefined,
        claimMapping: {
          externalUserId: claimRaw.externalUserId ?? 'sub',
          clientUID: claimRaw.clientUID ?? 'client_uid',
        },
      },
    },
    cliLogin: { redirectTo: cliLoginRaw.redirectTo ?? '' },
  };
}

const ENV_VAR_PATTERN = /\$\{([^}:-]+)(?::-(.*?))?\}/g;

function resolveEnvVars(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (_, varName: string, defaultValue?: string) => {
    return process.env[varName] ?? defaultValue ?? '';
  });
}

function resolveEnvVarsDeep(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return resolveEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVarsDeep);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVarsDeep(value);
    }
    return result;
  }
  return obj;
}

export function loadConfig(configPath?: string): ShellpilotModuleConfig {
  const path = configPath ?? process.env.SHELLPILOT_CONFIG ?? join(process.cwd(), 'config.yml');

  if (!existsSync(path)) {
    throw new Error(
      `Configuration file not found: ${path}\n` +
        'Copy config.example.yml to config.yml and adjust to your environment.',
    );
  }

  const raw = readFileSync(path, 'utf-8');
  const parsed = yaml.load(raw) as Record<string, unknown>;
  const resolved = resolveEnvVarsDeep(parsed) as ShellpilotModuleConfig;

  resolved.extensions = resolved.extensions ?? { properties: [] };
  resolved.logging = resolved.logging ?? { level: 'info', format: 'json' };

  if (!resolved.secrets?.masterKey) {
    throw new Error(
      'Missing required config value: secrets.masterKey (32-byte base64 string). ' +
        'Generate one with: openssl rand -base64 32',
    );
  }

  if (!resolved.auth?.jwt?.secret) {
    throw new Error('Missing required config value: auth.jwt.secret');
  }

  resolved.auth.apiKeyPrefix = resolved.auth.apiKeyPrefix ?? 'shp_';
  const { providers, cliLogin } = resolveAuthProviders(resolved.auth);
  resolved.auth.providers = providers;
  resolved.auth.cliLogin = cliLogin;
  resolved.jit = resolved.jit ?? { ttlSeconds: 60 };
  resolved.shellpilot = resolved.shellpilot ?? {
    defaultEnforcement: 'warn',
    redactPatterns: [],
  };
  resolved.catalog = {
    source: resolved.catalog?.source ?? 'github',
    repo: resolved.catalog?.repo ?? 'devicai/shellpilot',
    ref: resolved.catalog?.ref ?? 'main',
    path: resolved.catalog?.path ?? 'catalog',
    token: resolved.catalog?.token || undefined,
    cacheTtlSeconds: resolved.catalog?.cacheTtlSeconds ?? 300,
  };

  return resolved;
}

export const CONFIG = Symbol('SHELLPILOT_CONFIG');
