import { Request } from 'express';

export { ExtensionProperty, ShellpilotModuleConfig } from '../config/config.types';

export type ExtensionScope = Record<string, string>;

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'admin' | 'operator' | 'viewer';
  name?: string;
  /** Extension values (e.g. clientUID) carried by this principal; pins the tenant. */
  scope?: ExtensionScope;
}

export interface AuthenticatedApiKey {
  id: string;
  prefix: string;
  userId: string;
  scopes: string[];
  /** Extension values (e.g. clientUID) carried by this principal; pins the tenant. */
  scope?: ExtensionScope;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  apiKey?: AuthenticatedApiKey;
  extensionScope?: ExtensionScope;
}
