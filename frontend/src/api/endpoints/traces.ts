import { apiClient } from '../client';
import type { Paginated, Trace, TracesStats, TracesTimeseries } from '../../types/api';

export interface TracesListParams {
  cli?: string;
  userId?: string;
  decision?: string;
  from?: string;
  to?: string;
  excludeCli?: string;
  limit?: number;
  offset?: number;
}

export const tracesApi = {
  list: (params: TracesListParams = {}) =>
    apiClient.get<Paginated<Trace>>('/traces', { params }).then((r) => r.data),
  get: (id: string) => apiClient.get<Trace>(`/traces/${id}`).then((r) => r.data),
  stats: (period: '24h' | '7d' | '30d' = '24h') =>
    apiClient.get<TracesStats>('/traces/stats', { params: { period } }).then((r) => r.data),
  timeseries: (period: '24h' | '7d' | '30d' = '24h') =>
    apiClient.get<TracesTimeseries>('/traces/timeseries', { params: { period } }).then((r) => r.data),
};
