import { useEffect, useMemo, useState } from 'react';
import {
  App as AntApp,
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import {
  CloudDownloadOutlined,
  EyeOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { PageHeader } from '../../components/PageHeader';
import { CliLogo } from './ClisList';
import { catalogApi } from '../../api/endpoints/catalog';
import type { RegistryEntryDetail, RegistryListItem } from '../../types/api';

const { Text, Paragraph } = Typography;

function StatusTag({ item }: { item: RegistryListItem }) {
  if (!item.imported) return <Tag>Not imported</Tag>;
  if (item.updateAvailable) {
    return (
      <Tag color="orange">
        Update v{item.importedVersion} → v{item.version}
      </Tag>
    );
  }
  return <Tag color="green">Imported v{item.importedVersion}</Tag>;
}

export function CatalogRegistryPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [data, setData] = useState<RegistryListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [busySlug, setBusySlug] = useState<string | null>(null);

  // Preview drawer
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<RegistryEntryDetail | null>(null);
  const [previewItem, setPreviewItem] = useState<RegistryListItem | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setData(await catalogApi.listRegistry());
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Failed to load catalog registry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (c) =>
        c.slug.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.category?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q),
    );
  }, [data, query]);

  const doImport = async (item: RegistryListItem) => {
    setBusySlug(item.slug);
    try {
      // Re-importing an already-imported entry overwrites it (that IS the update).
      const res = await catalogApi.import(item.slug, item.imported);
      message.success(`${res.action === 'created' ? 'Imported' : 'Updated'} ${item.slug} (v${res.version})`);
      setPreviewOpen(false);
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Import failed');
    } finally {
      setBusySlug(null);
    }
  };

  const openPreview = async (item: RegistryListItem) => {
    setPreviewItem(item);
    setPreview(null);
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      setPreview(await catalogApi.getEntry(item.slug));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Failed to load entry');
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const importLabel = (item: RegistryListItem) =>
    item.updateAvailable ? 'Update' : item.imported ? 'Re-import' : 'Import';

  const columns: ColumnsType<RegistryListItem> = [
    {
      title: 'CLI',
      dataIndex: 'name',
      render: (_, item) => (
        <Space size={10}>
          <CliLogo iconUrl={item.iconUrl} size={28} />
          <div>
            <div>
              <Text strong style={{ fontSize: 13 }}>
                {item.name}
              </Text>
            </div>
            <Text type="secondary" className="shellpilot-mono" style={{ fontSize: 11 }}>
              {item.slug}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      width: 130,
      render: (c?: string) => (c ? <Tag>{c}</Tag> : <Text type="secondary">—</Text>),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      render: (d?: string) =>
        d ? (
          <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: 0, fontSize: 12 }}>
            {d}
          </Paragraph>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 200,
      render: (_, item) => <StatusTag item={item} />,
    },
    {
      title: '',
      key: 'actions',
      width: 200,
      align: 'right',
      render: (_, item) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openPreview(item)}>
            Preview
          </Button>
          <Button
            size="small"
            type={item.updateAvailable ? 'primary' : 'default'}
            icon={item.updateAvailable ? <ReloadOutlined /> : <CloudDownloadOutlined />}
            loading={busySlug === item.slug}
            disabled={item.imported && !item.updateAvailable}
            onClick={() => doImport(item)}
          >
            {importLabel(item)}
          </Button>
        </Space>
      ),
    },
  ];

  const updateCount = data.filter((d) => d.updateAvailable).length;

  return (
    <>
      <PageHeader
        title="Catalog Registry"
        description="Official ShellPilot CLI catalog. Preview an entry, then import it into your catalog. Imported entries are pinned to their version — updates are opt-in."
        extra={
          <Space>
            <Input
              prefix={<SearchOutlined />}
              placeholder="Search by slug, name, category…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              allowClear
              style={{ width: 280 }}
            />
            <Button onClick={() => navigate('/clis')}>My catalog</Button>
          </Space>
        }
      />

      {updateCount > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${updateCount} imported ${updateCount === 1 ? 'entry has' : 'entries have'} a newer version available upstream.`}
        />
      )}

      {filtered.length === 0 && !loading ? (
        <Empty description={query ? 'No entries match your search' : 'Catalog is empty'} />
      ) : (
        <Table
          rowKey="slug"
          size="middle"
          loading={loading}
          dataSource={filtered}
          columns={columns}
          pagination={false}
        />
      )}

      <Drawer
        width={640}
        open={previewOpen}
        title={previewItem ? `Preview — ${previewItem.name}` : 'Preview'}
        onClose={() => setPreviewOpen(false)}
        extra={
          previewItem && (
            <Button
              type="primary"
              icon={previewItem.updateAvailable ? <ReloadOutlined /> : <CloudDownloadOutlined />}
              loading={busySlug === previewItem.slug}
              disabled={previewItem.imported && !previewItem.updateAvailable}
              onClick={() => doImport(previewItem)}
            >
              {importLabel(previewItem)}
            </Button>
          )
        }
        destroyOnClose
      >
        {previewLoading || !preview ? (
          <Text type="secondary">Loading…</Text>
        ) : (
          <PreviewBody detail={preview} />
        )}
      </Drawer>
    </>
  );
}

function PreviewBody({ detail }: { detail: RegistryEntryDetail }) {
  const { cli, meta } = detail;
  const install = cli.installCommands ?? {};
  const installTabs = (['mac', 'linux', 'windows'] as const)
    .filter((os) => install[os])
    .map((os) => ({
      key: os,
      label: os === 'mac' ? 'macOS' : os.charAt(0).toUpperCase() + os.slice(1),
      children: <CodeBlock text={install[os] as string} />,
    }));

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Space align="start" size={12}>
          <CliLogo iconUrl={cli.iconUrl ?? meta.iconUrl} size={40} />
          <div>
            <Space size={8} wrap>
              <Tag color="blue">v{meta.version}</Tag>
              {meta.category && <Tag>{meta.category}</Tag>}
              <Text type="secondary" className="shellpilot-mono" style={{ fontSize: 12 }}>
                {meta.slug}
              </Text>
            </Space>
            {cli.description && <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>{cli.description}</Paragraph>}
          </div>
        </Space>
      </div>

      <div>
        <Text strong>Auth</Text>
        <div style={{ marginTop: 4 }}>
          <Tag color="geekblue">mode: {cli.auth?.mode ?? 'none'}</Tag>
          {cli.auth?.envVar && <Tag>env: {cli.auth.envVar}</Tag>}
          {cli.defaultEnforcement && <Tag>enforcement: {cli.defaultEnforcement}</Tag>}
        </div>
      </div>

      <div>
        <Tooltip title="The exact shell that runs on `wrapper install`. Review before importing.">
          <Text strong>Install command </Text>
        </Tooltip>
        {installTabs.length > 0 ? (
          <Tabs items={installTabs} size="small" />
        ) : (
          <Paragraph type="secondary" style={{ marginTop: 4 }}>
            No install command declared.
          </Paragraph>
        )}
      </div>

      {(cli.auth?.delivery?.length || cli.auth?.postProcess?.length) ? (
        <div>
          <Text strong>Credential handling</Text>
          {cli.auth?.postProcess?.length ? (
            <>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                postProcess (server-side)
              </Text>
              <CodeBlock text={JSON.stringify(cli.auth.postProcess, null, 2)} />
            </>
          ) : null}
          {cli.auth?.delivery?.length ? (
            <>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                delivery (client-side)
              </Text>
              <CodeBlock text={JSON.stringify(cli.auth.delivery, null, 2)} />
            </>
          ) : null}
        </div>
      ) : null}
    </Space>
  );
}

function CodeBlock({ text }: { text: string }) {
  return (
    <pre
      style={{
        background: '#0a0a0a',
        border: '1px solid #2f2f2f',
        borderRadius: 6,
        padding: 10,
        fontSize: 12,
        margin: '4px 0 0',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: 'var(--shellpilot-mono, monospace)',
      }}
    >
      {text}
    </pre>
  );
}
