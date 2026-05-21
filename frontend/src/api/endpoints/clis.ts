import { apiClient } from '../client';
import type { CliCatalogItem, Paginated } from '../../types/api';

export interface CreateCliPayload {
  slug: string;
  name: string;
  vendor?: string;
  description?: string;
  envVarHint?: string;
  defaultEnforcement?: 'enforce' | 'warn' | 'audit';
  installCommands?: { mac?: string; linux?: string; windows?: string };
  docsUrl?: string;
  icon?: string;
  active?: boolean;
}

export type UpdateCliPayload = Partial<Omit<CreateCliPayload, 'slug'>>;

export const clisApi = {
  list: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<Paginated<CliCatalogItem>>('/clis', { params }).then((r) => r.data),
  get: (idOrSlug: string) => apiClient.get<CliCatalogItem>(`/clis/${idOrSlug}`).then((r) => r.data),
  create: (payload: CreateCliPayload) =>
    apiClient.post<CliCatalogItem>('/clis', payload).then((r) => r.data),
  update: (id: string, payload: UpdateCliPayload) =>
    apiClient.patch<CliCatalogItem>(`/clis/${id}`, payload).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/clis/${id}`),
};
