export type UserRole = 'admin' | 'operator' | 'viewer';
export type UserType = 'human' | 'service';

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
  type: UserType;
  policyId?: string;
  profileId?: string;
  active: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  id: string;
  name: string;
  description?: string;
  clis: string[];
  policyId?: string;
  defaultCredentials?: Array<{ cli: string; payload: Record<string, unknown> }>;
  active: boolean;
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

export type CliAuthMode = 'env' | 'env-multi' | 'file' | 'flag' | 'login-command' | 'none';

// Free-form generic primitives. The backend currently understands `http-form-post`;
// future kinds (jwt-exchange, etc.) plug in via the registry without changing this shape.
export interface PostProcessStep {
  kind: string;
  [key: string]: {} | undefined;
}

// `kind` ∈ { file, env, env-file, flag }. The wrapper interprets these generically.
export interface DeliveryStep {
  kind: string;
  [key: string]: {} | undefined;
}

// String for same-on-all-OS, or per-OS object that the wrapper picks based on
// its runtime (Darwin → mac, Linux → linux, Windows → windows).
export type OsPath = string | { mac?: string; linux?: string; windows?: string };

export interface CliAuth {
  mode: CliAuthMode;
  envVar?: string;
  envVars?: string[];
  filePath?: OsPath;
  fileFormat?: 'raw' | 'json' | 'yaml';
  flag?: string;
  loginCommand?: string;
  postProcess?: PostProcessStep[];
  delivery?: DeliveryStep[];
}

// Provenance for entries imported from the public catalog registry. Absent on
// entries created or edited locally.
export interface CliSource {
  origin?: string; // 'registry'
  repo?: string;
  ref?: string;
  path?: string;
  version?: number;
  sha?: string;
  importedAt?: string;
}

export interface CliCatalogItem {
  id: string;
  slug: string;
  name: string;
  vendor?: string;
  description?: string;
  auth?: CliAuth;
  defaultEnforcement: 'enforce' | 'warn' | 'audit';
  installCommands: { mac?: string; linux?: string; windows?: string };
  docsUrl?: string;
  icon?: string;
  iconUrl?: string;
  active: boolean;
  source?: CliSource;
  createdAt: string;
  updatedAt: string;
}

// --- Public catalog registry ---

export interface RegistryListItem {
  slug: string;
  name: string;
  description?: string;
  category?: string;
  iconUrl?: string;
  version: number;
  imported: boolean;
  importedVersion?: number;
  updateAvailable: boolean;
}

export interface RegistryEntryDetail {
  meta: {
    slug: string;
    name: string;
    description?: string;
    category?: string;
    iconUrl?: string;
    version: number;
  };
  cli: Partial<CliCatalogItem>;
  sha?: string;
}

export interface CatalogUpdate {
  slug: string;
  name: string;
  importedVersion: number;
  availableVersion: number;
}

export interface ImportRegistryResult {
  action: 'created' | 'updated';
  slug: string;
  version: number;
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
  webhookSecret?: string;
  version: number;
  active: boolean;
  // Set when this is a user's individual rules (hidden from the global list).
  ownerUserId?: string;
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
  mode: CliAuthMode;
  envVar?: string;
  envVars?: string[];
  filePath?: string;
  fileFormat?: string;
  flag?: string;
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
