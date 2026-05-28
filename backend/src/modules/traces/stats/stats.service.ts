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

export interface TimeseriesPoint {
  ts: string;
  total: number;
  allow: number;
  deny: number;
  'requires-approval': number;
}

export interface TimeseriesResult {
  period: StatsPeriod;
  from: Date;
  bucket: 'hour' | 'day';
  points: TimeseriesPoint[];
}

const HOUR_MS = 1000 * 60 * 60;
const DAY_MS = 24 * HOUR_MS;

function periodStart(period: StatsPeriod): Date {
  switch (period) {
    case '24h':
      return new Date(Date.now() - 24 * HOUR_MS);
    case '7d':
      return new Date(Date.now() - 7 * DAY_MS);
    case '30d':
      return new Date(Date.now() - 30 * DAY_MS);
  }
}

// Hide the wrapper's own self-emitted traces (install/uninstall lifecycle, the
// trace POSTed when the wrapper boots its dispatcher). They drown out the
// signal we care about — actual CLI invocations from agents — but we still keep
// them in the DB so they can be queried explicitly via the Traces page filter.
// Includes legacy slugs so pre-v0.6 traces stay hidden after the rename too.
const EXCLUDED_FROM_DASHBOARD = ['shellpilot', 'devic-cli-wrapper', 'devic-wrapper'];

@Injectable()
export class StatsService {
  constructor(private readonly repo: TracesRepository) {}

  async aggregate(period: StatsPeriod = '24h'): Promise<StatsResult> {
    const from = periodStart(period);
    const match = {
      $match: { timestamp: { $gte: from }, cli: { $nin: EXCLUDED_FROM_DASHBOARD } },
    };

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

  async timeseries(period: StatsPeriod = '24h'): Promise<TimeseriesResult> {
    const from = periodStart(period);
    const bucket: 'hour' | 'day' = period === '24h' ? 'hour' : 'day';
    const bucketMs = bucket === 'hour' ? HOUR_MS : DAY_MS;

    // Truncate each timestamp down to the start of its bucket (hour or day) so
    // points line up regardless of how clock-skewed the wrapper traces are.
    const dateExpr =
      bucket === 'hour'
        ? { $dateTrunc: { date: '$timestamp', unit: 'hour' } }
        : { $dateTrunc: { date: '$timestamp', unit: 'day' } };

    const agg = await this.repo.aggregate<{
      _id: Date;
      total: number;
      allow: number;
      deny: number;
      requiresApproval: number;
    }>([
      { $match: { timestamp: { $gte: from }, cli: { $nin: EXCLUDED_FROM_DASHBOARD } } },
      {
        $group: {
          _id: dateExpr,
          total: { $sum: 1 },
          allow: { $sum: { $cond: [{ $eq: ['$decision', 'allow'] }, 1, 0] } },
          deny: { $sum: { $cond: [{ $eq: ['$decision', 'deny'] }, 1, 0] } },
          requiresApproval: {
            $sum: { $cond: [{ $eq: ['$decision', 'requires-approval'] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Fill empty buckets between `from` and now so the chart is continuous —
    // a flat line of zeros is more legible than a sparse one with gaps.
    const byTs = new Map<number, (typeof agg)[number]>();
    for (const p of agg) byTs.set(new Date(p._id).getTime(), p);

    const points: TimeseriesPoint[] = [];
    const start = bucket === 'hour'
      ? new Date(Math.floor(from.getTime() / HOUR_MS) * HOUR_MS)
      : new Date(Math.floor(from.getTime() / DAY_MS) * DAY_MS);
    const now = Date.now();
    for (let t = start.getTime(); t <= now; t += bucketMs) {
      const row = byTs.get(t);
      points.push({
        ts: new Date(t).toISOString(),
        total: row?.total ?? 0,
        allow: row?.allow ?? 0,
        deny: row?.deny ?? 0,
        'requires-approval': row?.requiresApproval ?? 0,
      });
    }

    return { period, from, bucket, points };
  }
}
