import { apiClient } from '../client';
import type { ApiKeyMeta, IssuedApiKey, Paginated } from '../../types/api';

export interface CreateApiKeyPayload {
  name: string;
  userId?: string;
  scopes?: string[];
  expiresAt?: string;
}

export const apiKeysApi = {
  list: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<Paginated<ApiKeyMeta>>('/api-keys', { params }).then((r) => r.data),
  create: (payload: CreateApiKeyPayload) =>
    apiClient.post<IssuedApiKey>('/api-keys', payload).then((r) => r.data),
  rotate: (id: string) => apiClient.post<IssuedApiKey>(`/api-keys/${id}/rotate`).then((r) => r.data),
  revoke: (id: string) => apiClient.delete(`/api-keys/${id}`),
};
