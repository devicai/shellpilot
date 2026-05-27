import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import { ShellpilotModuleConfig } from './config.types';

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
