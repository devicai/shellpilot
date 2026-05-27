import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Card,
  Col,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Typography,
} from 'antd';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { DecisionTag } from '../components/PolicyTags';
import { tracesApi } from '../api/endpoints/traces';
import { usersApi } from '../api/endpoints/users';
import { clisApi } from '../api/endpoints/clis';
import type {
  CliCatalogItem,
  Decision,
  Trace,
  TracesStats,
  TracesTimeseries,
  User,
} from '../types/api';
import { CliLogo } from './clis/ClisList';

const { Text } = Typography;

const WRAPPER_CLIS = ['devic-cli-wrapper', 'devic-wrapper'];

export function DashboardPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('24h');
  const [stats, setStats] = useState<TracesStats | null>(null);
  const [series, setSeries] = useState<TracesTimeseries | null>(null);
  const [recent, setRecent] = useState<Trace[]>([]);
  const [usersById, setUsersById] = useState<Record<string, User>>({});
  const [clisBySlug, setClisBySlug] = useState<Record<string, CliCatalogItem>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadCaches = async () => {
    try {
      const [users, clis] = await Promise.all([
        usersApi.list({ limit: 500 }),
        clisApi.list({ limit: 500 }),
      ]);
      setUsersById(Object.fromEntries(users.data.map((u) => [u.id, u])));
      setClisBySlug(Object.fromEntries(clis.data.map((c) => [c.slug, c])));
    } catch {
      // non-fatal — labels fall back to raw values
    }
  };

  useEffect(() => {
    loadCaches();
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      tracesApi.stats(period),
      tracesApi.timeseries(period),
      tracesApi.list({ limit: 15, excludeCli: WRAPPER_CLIS.join(',') }),
    ])
      .then(([s, t, r]) => {
        setStats(s);
        setSeries(t);
        setRecent(r.data);
      })
      .catch((e) => setError(e?.response?.data?.message ?? 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, [period]);

  const chartData = useMemo(
    () =>
      (series?.points ?? []).map((p) => ({
        ...p,
        label:
          series?.bucket === 'hour'
            ? dayjs(p.ts).format('HH:mm')
            : dayjs(p.ts).format('MMM D'),
      })),
    [series],
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Recent CLI activity intercepted by ShellPilot"
        extra={
          <Select
            value={period}
            onChange={(v) => setPeriod(v)}
            options={[
              { value: '24h', label: 'Last 24 hours' },
              { value: '7d', label: 'Last 7 days' },
              { value: '30d', label: 'Last 30 days' },
            ]}
          />
        }
      />

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}

      <Spin spinning={loading}>
        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col xs={12} md={6}>
            <Card size="small">
              <Statistic title="Total commands" value={stats?.total ?? 0} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small">
              <Statistic
                title="Allowed"
                value={stats?.byDecision.allow ?? 0}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small">
              <Statistic
                title="Denied"
                value={stats?.byDecision.deny ?? 0}
                valueStyle={{ color: '#ff4d4f' }}
              />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small">
              <Statistic
                title="Requires approval"
                value={stats?.byDecision['requires-approval'] ?? 0}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
        </Row>

        <Card title="Activity over time" size="small" style={{ marginBottom: 12 }}>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#2f2f2f" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#b3b3b3"
                  tick={{ fontSize: 11, fill: '#b3b3b3' }}
                />
                <YAxis
                  stroke="#b3b3b3"
                  tick={{ fontSize: 11, fill: '#b3b3b3' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1f1f1f',
                    border: '1px solid #424242',
                    borderRadius: 6,
                    color: '#b3b3b3',
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#b3b3b3' }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total"
                  stroke="#4661B1"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="allow"
                  name="Allow"
                  stroke="#52c41a"
                  strokeWidth={1.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="deny"
                  name="Deny"
                  stroke="#ff4d4f"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Latest traces" size="small">
          <Table<Trace>
            rowKey="id"
            size="small"
            dataSource={recent}
            pagination={false}
            onRow={() => ({
              onClick: () => navigate('/traces'),
              style: { cursor: 'pointer' },
            })}
            columns={[
              {
                title: 'Time',
                dataIndex: 'timestamp',
                width: 130,
                render: (v) => (
                  <Text className="shellpilot-mono" style={{ fontSize: 11 }}>
                    {dayjs(v).format('MM-DD HH:mm:ss')}
                  </Text>
                ),
              },
              {
                title: 'Command',
                render: (_, r) => (
                  <Space size={8}>
                    <CliLogo iconUrl={clisBySlug[r.cli]?.iconUrl} size={18} />
                    <Text className="shellpilot-mono" style={{ fontSize: 12 }}>
                      {r.cli} {r.commandPath.join(' ')}
                    </Text>
                  </Space>
                ),
              },
              {
                title: 'Decision',
                dataIndex: 'decision',
                width: 120,
                render: (v) => <DecisionTag value={v as Decision} />,
              },
              {
                title: 'User',
                dataIndex: 'userId',
                width: 220,
                render: (v?: string) => {
                  const email = v ? usersById[v]?.email ?? v : undefined;
                  return email ? (
                    <Text style={{ fontSize: 12 }}>{email}</Text>
                  ) : (
                    <Text type="secondary">—</Text>
                  );
                },
              },
            ]}
          />
        </Card>
      </Spin>
    </>
  );
}
