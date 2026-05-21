export type UserRole = 'admin' | 'operator' | 'viewer';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: string;
  user: AuthenticatedUser;
}

export interface Paginated<T> {
  data: T[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyMeta {
  id: string;
  name: string;
  prefix: string;
  userId: string;
  scopes: string[];
  lastUsedAt?: string;
  expiresAt?: string;
  active: boolean;
  createdAt: string;
}

export interface IssuedApiKey extends ApiKeyMeta {
  token: string;
}

export interface CliCatalogItem {
  id: string;
  slug: string;
  name: string;
  vendor?: string;
  description?: string;
  envVarHint?: string;
  defaultEnforcement: 'enforce' | 'warn' | 'audit';
  installCommands: { mac?: string; linux?: string; windows?: string };
  docsUrl?: string;
  icon?: string;
  iconUrl?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type Decision = 'allow' | 'deny' | 'requires-approval';
export type Enforcement = 'enforce' | 'warn' | 'audit';

export interface Policy {
  id: string;
  name: string;
  description?: string;
  defaultEffect: Decision;
  enforcement: Enforcement;
  clis: string[];
  webhooks: Record<string, string>;
  version: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Rule {
  id: string;
  policyId: string;
  cli: string;
  path: string;
  effect: Decision;
  reason?: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface CredentialEntry {
  id: string;
  userId: string;
  cli: string;
  envVar: string;
  createdAt: string;
  updatedAt: string;
}

export interface Trace {
  id: string;
  cli: string;
  commandPath: string[];
  args: string[];
  decision: Decision;
  enforcement?: Enforcement;
  matchedRuleId?: string;
  matchedRulePath?: string;
  reason?: string;
  userId?: string;
  apiKeyPrefix?: string;
  agent?: string;
  durationMs?: number;
  exitCode?: number;
  timestamp: string;
  createdAt: string;
}

export interface TracesStats {
  period: '24h' | '7d' | '30d';
  from: string;
  total: number;
  byDecision: Record<string, number>;
  byCli: Array<{ cli: string; count: number }>;
  byUser: Array<{ userId: string | null; count: number }>;
}

export interface TracesTimeseriesPoint {
  ts: string;
  total: number;
  allow: number;
  deny: number;
  'requires-approval': number;
}

export interface TracesTimeseries {
  period: '24h' | '7d' | '30d';
  from: string;
  bucket: 'hour' | 'day';
  points: TracesTimeseriesPoint[];
}

export interface EvaluationResult {
  decision: Decision;
  enforcement: Enforcement;
  matchedRule?: {
    id: string;
    cli: string;
    path: string;
    effect: Decision;
    reason?: string;
    priority: number;
  };
  policy: { id: string; name: string; version: number };
}
