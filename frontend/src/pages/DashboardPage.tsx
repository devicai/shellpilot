import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Table, Tag, Typography, Spin, Alert, Select } from 'antd';
import { PageHeader } from '../components/PageHeader';
import { tracesApi } from '../api/endpoints/traces';
import type { TracesStats } from '../types/api';

const { Text } = Typography;

export function DashboardPage() {
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('24h');
  const [stats, setStats] = useState<TracesStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    tracesApi
      .stats(period)
      .then(setStats)
      .catch((e) => setError(e?.response?.data?.message ?? 'Failed to load stats'))
      .finally(() => setLoading(false));
  }, [period]);

  const decisionColor = (d: string) =>
    d === 'allow' ? 'green' : d === 'deny' ? 'red' : 'gold';

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
        <Row gutter={16}>
          <Col span={6}>
            <Card>
              <Statistic title="Total commands" value={stats?.total ?? 0} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="Allowed" value={stats?.byDecision.allow ?? 0} valueStyle={{ color: '#52c41a' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="Denied" value={stats?.byDecision.deny ?? 0} valueStyle={{ color: '#ff4d4f' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Requires approval"
                value={stats?.byDecision['requires-approval'] ?? 0}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={12}>
            <Card title="Top CLIs">
              <Table
                size="small"
                pagination={false}
                rowKey="cli"
                dataSource={stats?.byCli ?? []}
                columns={[
                  { title: 'CLI', dataIndex: 'cli', render: (v) => <Tag color="blue">{v}</Tag> },
                  { title: 'Count', dataIndex: 'count', align: 'right' as const, width: 100 },
                ]}
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card title="Top Users">
              <Table
                size="small"
                pagination={false}
                rowKey={(r) => r.userId ?? 'anonymous'}
                dataSource={stats?.byUser ?? []}
                columns={[
                  {
                    title: 'User',
                    dataIndex: 'userId',
                    render: (v) => (v ? <Text className="shellpilot-mono">{v}</Text> : <Text type="secondary">anonymous</Text>),
                  },
                  { title: 'Count', dataIndex: 'count', align: 'right' as const, width: 100 },
                ]}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card title="Decisions breakdown">
              <Row gutter={16}>
                {Object.entries(stats?.byDecision ?? {}).map(([d, count]) => (
                  <Col key={d}>
                    <Tag color={decisionColor(d)} style={{ fontSize: 14, padding: '6px 12px' }}>
                      {d}: {count}
                    </Tag>
                  </Col>
                ))}
              </Row>
            </Card>
          </Col>
        </Row>
      </Spin>
    </>
  );
}
