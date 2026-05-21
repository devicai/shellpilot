import { apiClient } from '../client';
import type { AuthenticatedUser, LoginResponse } from '../../types/api';

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data),
  me: () => apiClient.get<AuthenticatedUser>('/auth/me').then((r) => r.data),
  logout: () => apiClient.post('/auth/logout'),
};
