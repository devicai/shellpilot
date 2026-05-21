import { apiClient } from '../client';
import type { Decision, Enforcement, EvaluationResult, Paginated, Policy, Rule } from '../../types/api';

export interface CreatePolicyPayload {
  name: string;
  description?: string;
  defaultEffect?: Decision;
  enforcement?: Enforcement;
  clis?: string[];
  webhooks?: Record<string, string>;
  active?: boolean;
}

export type UpdatePolicyPayload = Partial<CreatePolicyPayload>;

export interface CreateRulePayload {
  cli: string;
  path: string;
  effect: Decision;
  reason?: string;
  priority?: number;
}

export type UpdateRulePayload = Partial<CreateRulePayload>;

export const rulesApi = {
  listPolicies: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<Paginated<Policy>>('/rules/policies', { params }).then((r) => r.data),
  getPolicy: (id: string) => apiClient.get<Policy>(`/rules/policies/${id}`).then((r) => r.data),
  createPolicy: (payload: CreatePolicyPayload) =>
    apiClient.post<Policy>('/rules/policies', payload).then((r) => r.data),
  updatePolicy: (id: string, payload: UpdatePolicyPayload) =>
    apiClient.put<Policy>(`/rules/policies/${id}`, payload).then((r) => r.data),
  activatePolicy: (id: string) =>
    apiClient.post<Policy>(`/rules/policies/${id}/activate`).then((r) => r.data),
  deletePolicy: (id: string) => apiClient.delete(`/rules/policies/${id}`),

  listRules: (policyId: string) =>
    apiClient.get<Rule[]>(`/rules/policies/${policyId}/rules`).then((r) => r.data),
  createRule: (policyId: string, payload: CreateRulePayload) =>
    apiClient.post<Rule>(`/rules/policies/${policyId}/rules`, payload).then((r) => r.data),
  updateRule: (id: string, payload: UpdateRulePayload) =>
    apiClient.patch<Rule>(`/rules/rules/${id}`, payload).then((r) => r.data),
  deleteRule: (id: string) => apiClient.delete(`/rules/rules/${id}`),

  evaluate: (cli: string, args: string[], policyId?: string) =>
    apiClient
      .post<EvaluationResult>('/rules/evaluate', { cli, args, policyId })
      .then((r) => r.data),
};
