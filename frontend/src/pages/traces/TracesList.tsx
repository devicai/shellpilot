import { useEffect, useState } from 'react';
import { App as AntApp, Button, Card, DatePicker, Drawer, Input, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { tracesApi, type TracesListParams } from '../../api/endpoints/traces';
import type { Decision, Trace } from '../../types/api';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const DECISION_OPTS = [
  { value: '', label: 'All decisions' },
  { value: 'allow', label: 'Allow' },
  { value: 'deny', label: 'Deny' },
  { value: 'requires-approval', label: 'Requires approval' },
];

export function TracesListPage() {
  const { message } = AntApp.useApp();
  const [data, setData] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<TracesListParams>({ limit: 50 });
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [detail, setDetail] = useState<Trace | null>(null);

  const load = async (next: TracesListParams = filters) => {
    setLoading(true);
    try {
      const res = await tracesApi.list(next);
      setData(res.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Failed to load traces');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = () => {
    const next: TracesListParams = { ...filters };
    if (range?.[0]) next.from = range[0].toISOString();
    if (range?.[1]) next.to = range[1].toISOString();
    setFilters(next);
    load(next);
  };

  const decisionColor = (d: Decision) =>
    d === 'allow' ? 'green' : d === 'deny' ? 'red' : 'gold';

  return (
    <>
      <PageHeader title="Traces" description="Audit trail of CLI invocations intercepted by the wrapper" />

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="CLI"
            allowClear
            style={{ width: 140 }}
            onChange={(e) => setFilters((f) => ({ ...f, cli: e.target.value || undefined }))}
          />
          <Input
            placeholder="User id"
            allowClear
            style={{ width: 220 }}
            onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value || undefined }))}
          />
          <Select
            style={{ width: 200 }}
            options={DECISION_OPTS}
            defaultValue=""
            onChange={(v) => setFilters((f) => ({ ...f, decision: v || undefined }))}
          />
          <RangePicker showTime onChange={(v) => setRange(v as [Dayjs | null, Dayjs | null])} />
          <Button type="primary" onClick={applyFilters}>
            Apply
          </Button>
        </Space>
      </Card>

      <Table<Trace>
        rowKey="id"
        loading={loading}
        dataSource={data}
        onRow={(r) => ({ onClick: () => setDetail(r) })}
        columns={[
          {
            title: 'Timestamp',
            dataIndex: 'timestamp',
            render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
            width: 180,
          },
          { title: 'CLI', dataIndex: 'cli', render: (v) => <Tag color="blue">{v}</Tag> },
          {
            title: 'Command',
            render: (_, r) => (
              <Text className="shellpilot-mono">
                {r.cli} {r.commandPath.join(' ')}
              </Text>
            ),
          },
          {
            title: 'Decision',
            dataIndex: 'decision',
            width: 140,
            render: (v) => <Tag color={decisionColor(v)}>{v}</Tag>,
          },
          { title: 'User', dataIndex: 'userId', width: 220, render: (v) => v ? <Text className="shellpilot-mono">{v}</Text> : <Text type="secondary">—</Text> },
          { title: 'Agent', dataIndex: 'agent' },
        ]}
      />

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.cli} ${detail.commandPath.join(' ')}` : ''}
        width={520}
      >
        {detail && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text type="secondary">Decision</Text>
              <div><Tag color={decisionColor(detail.decision)}>{detail.decision}</Tag></div>
            </div>
            <div>
              <Text type="secondary">Matched rule</Text>
              <div className="shellpilot-mono">{detail.matchedRulePath ?? '(default policy effect)'}</div>
            </div>
            {detail.reason && (
              <div>
                <Text type="secondary">Reason</Text>
                <div>{detail.reason}</div>
              </div>
            )}
            <div>
              <Text type="secondary">Args (redacted)</Text>
              <pre className="shellpilot-mono" style={{ background: '#0a0a0a', padding: 8, borderRadius: 4 }}>
                {JSON.stringify(detail.args, null, 2)}
              </pre>
            </div>
            <div>
              <Text type="secondary">Metadata</Text>
              <ul>
                <li>User id: <Text className="shellpilot-mono">{detail.userId ?? '—'}</Text></li>
                <li>API key prefix: <Text className="shellpilot-mono">{detail.apiKeyPrefix ?? '—'}</Text></li>
                <li>Agent: {detail.agent ?? '—'}</li>
                <li>Duration: {detail.durationMs ?? '—'} ms</li>
                <li>Exit code: {detail.exitCode ?? '—'}</li>
                <li>Timestamp: {dayjs(detail.timestamp).format('YYYY-MM-DD HH:mm:ss')}</li>
              </ul>
            </div>
          </Space>
        )}
      </Drawer>
    </>
  );
}
