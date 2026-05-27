export interface ShellpilotModuleConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  auth: AuthConfig;
  secrets: SecretsConfig;
  jit: JitConfig;
  extensions: ExtensionsConfig;
  logging: LoggingConfig;
  shellpilot: ShellpilotConfig;
  catalog: CatalogConfig;
}

export interface ServerConfig {
  port: number;
  basePath: string;
  cors?: {
    enabled: boolean;
    origins: string[];
  };
}

export interface DatabaseConfig {
  provider: 'mongodb';
  uri: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

export interface AuthConfig {
  jwt: {
    secret: string;
    expiresIn: string;
  };
  bootstrap?: {
    adminEmail: string;
    adminPassword: string;
  };
  apiKeyPrefix: string;
}

export interface SecretsConfig {
  masterKey: string;
}

export interface JitConfig {
  ttlSeconds: number;
}

export interface ExtensionsConfig {
  properties: ExtensionProperty[];
}

export interface ExtensionProperty {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  required: boolean;
  index: boolean;
  entities: string[] | '*';
  source: 'header';
  headerName: string;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'pretty';
}

export interface ShellpilotConfig {
  defaultEnforcement: 'enforce' | 'warn' | 'audit';
  redactPatterns: string[];
}

// Public CLI catalog registry. Source of truth lives in a Git repo (or a local
// mirror dir); the backend fetches index.yml + clis/<slug>.yml from it, never
// the app source code. Fetch ref is `main` so catalog updates flow without a
// backend redeploy; reproducibility is preserved at import time (each imported
// entry snapshots its source.version + sha in the DB — updates are opt-in).
export interface CatalogConfig {
  // 'github' fetches via the GitHub Contents API; 'local' reads a directory on
  // disk (dev, air-gapped, or an enterprise mirror).
  source: 'github' | 'local';
  // github: `owner/repo` (e.g. devicai/shellpilot). local: a directory path.
  repo: string;
  // git ref to fetch from (github only). Default 'main'.
  ref: string;
  // subdirectory holding index.yml and clis/. Default 'catalog'.
  path: string;
  // read-only token while the repo is private; leave empty once it's public.
  token?: string;
  // Redis cache TTL for fetched files (github only). Keeps GitHub rate limits
  // and latency down without pinning users to a stale snapshot.
  cacheTtlSeconds: number;
}
