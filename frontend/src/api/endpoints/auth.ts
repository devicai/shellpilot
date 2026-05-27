import { apiClient } from '../client';
import type { AuthenticatedUser, LoginResponse } from '../../types/api';

export interface EnrollmentToken {
  enrollToken: string;
  expiresAt: string;
  userEmail: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data),
  me: () => apiClient.get<AuthenticatedUser>('/auth/me').then((r) => r.data),
  logout: () => apiClient.post('/auth/logout'),
  // Admin: single-use enrollment token for a user (case 3, downloaded as a file).
  generateEnrollment: (userId: string) =>
    apiClient.post<EnrollmentToken>('/auth/enrollment', { userId }).then((r) => r.data),
};
