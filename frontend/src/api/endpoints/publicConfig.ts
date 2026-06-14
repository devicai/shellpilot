import { apiClient } from '../client';

export type AuthProviderName = 'local' | 'external-jwt';

export interface PublicConfig {
  auth: {
    /** Enabled authentication providers, in display order. */
    providers: AuthProviderName[];
    /** External login URL to bounce the browser to, or null to use the local form. */
    externalLoginUrl: string | null;
  };
}

export const publicConfigApi = {
  // Unauthenticated; read once at boot to decide how to render the login UI.
  get: () => apiClient.get<PublicConfig>('/public-config').then((r) => r.data),
};
