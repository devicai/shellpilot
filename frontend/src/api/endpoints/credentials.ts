import { apiClient } from '../client';
import type { CredentialEntry, Paginated } from '../../types/api';

export interface StoreCredentialPayload {
  userId?: string;
  cli: string;
  envVar: string;
  secret: string;
}

export const credentialsApi = {
  list: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<Paginated<CredentialEntry>>('/credentials', { params }).then((r) => r.data),
  store: (payload: StoreCredentialPayload) =>
    apiClient.post<CredentialEntry>('/credentials/store', payload).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/credentials/${id}`),
};
