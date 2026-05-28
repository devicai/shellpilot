import { useEffect, useMemo, useState } from 'react';
import {
  App as AntApp,
  Button,
  Card,
  DatePicker,
  Drawer,
  Select,
  Space,
  Switch,
  Table,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { DecisionTag } from '../../components/PolicyTags';
import { tracesApi, type TracesListParams } from '../../api/endpoints/traces';
import { usersApi } from '../../api/endpoints/users';
import { clisApi } from '../../api/endpoints/clis';
import type { CliCatalogItem, Decision, Trace, User } from '../../types/api';
import { CliLogo } from '../clis/ClisList';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// Traces emitted by the wrapper about itself (boot, install/uninstall
// lifecycle, rule refresh). Hidden by default — the operator looking at this
// page cares about agent activity, not the wrapper's bookkeeping.
// Includes legacy slugs so traces logged before the v0.6 rename stay hidden too.
const WRAPPER_CLIS = ['shellpilot', 'devic-cli-wrapper', 'devic-wrapper'];

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
  const [showWrapper, setShowWrapper] = useState(false);

  const [usersById, setUsersById] = useState<Record<string, User>>({});
  const [clisBySlug, setClisBySlug] = useState<Record<string, CliCatalogItem>>({});

  const load = async (next: TracesListParams = filters, includeWrapper = showWrapper) => {
    setLoading(true);
    try {
      const params: TracesListParams = { ...next };
      if (!includeWrapper) params.excludeCli = WRAPPER_CLIS.join(',');
      const res = await tracesApi.list(params);
      setData(res.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Failed to load traces');
    } finally {
      setLoading(false);
    }
  };

  // Side caches so we can render an email instead of a Mongo ObjectId and a
  // logo instead of the CLI slug. Both lists are tiny (tens of entries at
  // most), so loading them once on mount is cheaper than a backend join.
  const loadCaches = async () => {
    try {
      const [users, clis] = await Promise.all([
        usersApi.list({ limit: 500 }),
        clisApi.list({ limit: 500 }),
      ]);
      setUsersById(Object.fromEntries(users.data.map((u) => [u.id, u])));
      setClisBySlug(Object.fromEntries(clis.data.map((c) => [c.slug, c])));
    } catch {
      // non-fatal: traces still render with raw ids/slugs
    }
  };

  useEffect(() => {
    loadCaches();
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

  const userEmailFor = useMemo(
    () => (id?: string) => (id ? usersById[id]?.email ?? id : undefined),
    [usersById],
  );

  return (
    <>
      <PageHeader
        title="Traces"
        description="Audit trail of CLI invocations intercepted by the wrapper"
      />

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Select
            showSearch
            allowClear
            placeholder="CLI"
            optionFilterProp="label"
            style={{ width: 220 }}
            value={filters.cli}
            options={Object.values(clisBySlug).map((c) => ({
              value: c.slug,
              label: `${c.name} (${c.slug})`,
            }))}
            onChange={(v) => setFilters((f) => ({ ...f, cli: v || undefined }))}
          />
          <Select
            showSearch
            allowClear
            placeholder="User"
            optionFilterProp="label"
            style={{ width: 260 }}
            value={filters.userId}
            options={Object.values(usersById).map((u) => ({
              value: u.id,
              label: u.email,
            }))}
            onChange={(v) => setFilters((f) => ({ ...f, userId: v || undefined }))}
          />
          <Select
            style={{ width: 200 }}
            options={DECISION_OPTS}
            defaultValue=""
            onChange={(v) => setFilters((f) => ({ ...f, decision: v || undefined }))}
          />
          <RangePicker showTime onChange={(v) => setRange(v as [Dayjs | null, Dayjs | null])} />
          <Space>
            <Text type="secondary">Show wrapper traces</Text>
            <Switch
              size="small"
              checked={showWrapper}
              onChange={(v) => {
                setShowWrapper(v);
                load(filters, v);
              }}
            />
          </Space>
          <Button type="primary" onClick={applyFilters}>
            Apply
          </Button>
        </Space>
      </Card>

      <Table<Trace>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={data}
        onRow={(r) => ({
          onClick: () => setDetail(r),
          style: { cursor: 'pointer' },
        })}
        pagination={{ pageSize: 25, size: 'small' }}
        columns={[
          {
            title: 'Time',
            dataIndex: 'timestamp',
            width: 150,
            render: (v) => (
              <Text className="shellpilot-mono" style={{ fontSize: 11 }}>
                {dayjs(v).format('MM-DD HH:mm:ss')}
              </Text>
            ),
          },
          {
            title: 'CLI · Command',
            render: (_, r) => (
              <Space size={8} style={{ minWidth: 0 }}>
                <CliLogo iconUrl={clisBySlug[r.cli]?.iconUrl} size={18} />
                <Text className="shellpilot-mono" style={{ fontSize: 12 }} ellipsis>
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
              const email = userEmailFor(v);
              if (!email) return <Text type="secondary">—</Text>;
              return <Text style={{ fontSize: 12 }}>{email}</Text>;
            },
          },
          {
            title: 'Agent',
            dataIndex: 'agent',
            width: 130,
            render: (v?: string) =>
              v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">—</Text>,
          },
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
              <div>
                <DecisionTag value={detail.decision} />
              </div>
            </div>
            <div>
              <Text type="secondary">Matched rule</Text>
              <div className="shellpilot-mono">
                {detail.matchedRulePath ?? '(default policy effect)'}
              </div>
            </div>
            {detail.reason && (
              <div>
                <Text type="secondary">Reason</Text>
                <div>{detail.reason}</div>
              </div>
            )}
            <div>
              <Text type="secondary">Args (redacted)</Text>
              <pre
                className="shellpilot-mono"
                style={{ background: '#0a0a0a', padding: 8, borderRadius: 4 }}
              >
                {JSON.stringify(detail.args, null, 2)}
              </pre>
            </div>
            <div>
              <Text type="secondary">Metadata</Text>
              <ul style={{ paddingLeft: 18 }}>
                <li>
                  User:{' '}
                  <Text className="shellpilot-mono">
                    {userEmailFor(detail.userId) ?? '—'}
                  </Text>
                </li>
                <li>
                  API key prefix:{' '}
                  <Text className="shellpilot-mono">{detail.apiKeyPrefix ?? '—'}</Text>
                </li>
                <li>Agent: {detail.agent ?? '—'}</li>
                <li>Duration: {detail.durationMs ?? '—'} ms</li>
                <li>Exit code: {detail.exitCode ?? '—'}</li>
                <li>
                  Timestamp:{' '}
                  <Text className="shellpilot-mono">
                    {dayjs(detail.timestamp).format('YYYY-MM-DD HH:mm:ss')}
                  </Text>
                </li>
              </ul>
            </div>
          </Space>
        )}
      </Drawer>
    </>
  );
}
