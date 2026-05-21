import { Injectable } from '@nestjs/common';
import { TracesRepository } from '../traces.repository';

export type StatsPeriod = '24h' | '7d' | '30d';

export interface StatsResult {
  period: StatsPeriod;
  from: Date;
  total: number;
  byDecision: Record<string, number>;
  byCli: Array<{ cli: string; count: number }>;
  byUser: Array<{ userId: string | null; count: number }>;
}

const HOUR_MS = 1000 * 60 * 60;

function periodStart(period: StatsPeriod): Date {
  switch (period) {
    case '24h':
      return new Date(Date.now() - 24 * HOUR_MS);
    case '7d':
      return new Date(Date.now() - 7 * 24 * HOUR_MS);
    case '30d':
      return new Date(Date.now() - 30 * 24 * HOUR_MS);
  }
}

@Injectable()
export class StatsService {
  constructor(private readonly repo: TracesRepository) {}

  async aggregate(period: StatsPeriod = '24h'): Promise<StatsResult> {
    const from = periodStart(period);
    const match = { $match: { timestamp: { $gte: from } } };

    const [totalAgg, byDecisionAgg, byCliAgg, byUserAgg] = await Promise.all([
      this.repo.aggregate<{ count: number }>([match, { $count: 'count' }]),
      this.repo.aggregate<{ _id: string; count: number }>([
        match,
        { $group: { _id: '$decision', count: { $sum: 1 } } },
      ]),
      this.repo.aggregate<{ _id: string; count: number }>([
        match,
        { $group: { _id: '$cli', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      this.repo.aggregate<{ _id: string | null; count: number }>([
        match,
        { $group: { _id: '$userId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    return {
      period,
      from,
      total: totalAgg[0]?.count ?? 0,
      byDecision: Object.fromEntries(byDecisionAgg.map((d) => [d._id, d.count])),
      byCli: byCliAgg.map((d) => ({ cli: d._id, count: d.count })),
      byUser: byUserAgg.map((d) => ({ userId: d._id ? String(d._id) : null, count: d.count })),
    };
  }
}
