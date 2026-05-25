import { apiClient } from '../client';
import type { Paginated, Profile } from '../../types/api';

export interface CreateProfilePayload {
  name: string;
  description?: string;
  clis?: string[];
  policyId?: string;
  defaultCredentials?: Array<{ cli: string; payload: Record<string, unknown> }>;
  active?: boolean;
}

export type UpdateProfilePayload = Partial<CreateProfilePayload>;

export const profilesApi = {
  list: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<Paginated<Profile>>('/profiles', { params }).then((r) => r.data),
  get: (id: string) => apiClient.get<Profile>(`/profiles/${id}`).then((r) => r.data),
  create: (payload: CreateProfilePayload) =>
    apiClient.post<Profile>('/profiles', payload).then((r) => r.data),
  update: (id: string, payload: UpdateProfilePayload) =>
    apiClient.patch<Profile>(`/profiles/${id}`, payload).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/profiles/${id}`),
};
