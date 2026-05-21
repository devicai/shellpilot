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
