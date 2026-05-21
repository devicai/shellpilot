import { apiClient } from '../client';
import type { Paginated, User, UserRole } from '../../types/api';

export interface CreateUserPayload {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
  active?: boolean;
}

export interface UpdateUserPayload {
  email?: string;
  name?: string;
  role?: UserRole;
  active?: boolean;
}

export const usersApi = {
  list: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<Paginated<User>>('/users', { params }).then((r) => r.data),
  get: (id: string) => apiClient.get<User>(`/users/${id}`).then((r) => r.data),
  create: (payload: CreateUserPayload) => apiClient.post<User>('/users', payload).then((r) => r.data),
  update: (id: string, payload: UpdateUserPayload) =>
    apiClient.patch<User>(`/users/${id}`, payload).then((r) => r.data),
  changePassword: (id: string, newPassword: string) =>
    apiClient.post(`/users/${id}/change-password`, { newPassword }),
  remove: (id: string) => apiClient.delete(`/users/${id}`),
};
