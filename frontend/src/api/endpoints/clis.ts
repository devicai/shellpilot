import { apiClient } from '../client';
import type { CliAuth, CliCatalogItem, Paginated } from '../../types/api';

export interface CreateCliPayload {
  slug: string;
  name: string;
  vendor?: string;
  description?: string;
  auth?: CliAuth;
  defaultEnforcement?: 'enforce' | 'warn' | 'audit';
  installCommands?: { mac?: string; linux?: string; windows?: string };
  docsUrl?: string;
  icon?: string;
  iconUrl?: string;
  active?: boolean;
}

export type UpdateCliPayload = Partial<Omit<CreateCliPayload, 'slug'>>;

export interface ImportCatalogResult {
  created: string[];
  updated: string[];
  skipped: Array<{ slug: string; reason: string }>;
  errors: Array<{ slug?: string; reason: string }>;
}

export const clisApi = {
  list: (params?: { limit?: number; offset?: number; slug?: string }) =>
    apiClient.get<Paginated<CliCatalogItem>>('/clis', { params }).then((r) => r.data),
  get: (idOrSlug: string) => apiClient.get<CliCatalogItem>(`/clis/${idOrSlug}`).then((r) => r.data),
  create: (payload: CreateCliPayload) =>
    apiClient.post<CliCatalogItem>('/clis', payload).then((r) => r.data),
  update: (id: string, payload: UpdateCliPayload) =>
    apiClient.patch<CliCatalogItem>(`/clis/${id}`, payload).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/clis/${id}`),
  importYaml: (content: string, overwrite?: boolean) =>
    apiClient
      .post<ImportCatalogResult>('/clis/import', { content, overwrite })
      .then((r) => r.data),
  exportYaml: () =>
    apiClient
      .get<string>('/clis/export.yaml', { responseType: 'text', transformResponse: (data) => data })
      .then((r) => r.data),
};
