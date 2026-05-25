import { useEffect, useMemo, useState } from 'react';
import {
  App as AntApp,
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import { DownloadOutlined, ImportOutlined, SearchOutlined } from '@ant-design/icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTerminal } from '@fortawesome/free-solid-svg-icons';
import { PageHeader } from '../../components/PageHeader';
import { EnforcementTag } from '../../components/PolicyTags';
import { CliAuthFields } from '../../components/CliAuthFields';
import { clisApi, type CreateCliPayload, type ImportCatalogResult } from '../../api/endpoints/clis';
import type { CliCatalogItem } from '../../types/api';

const { Text, Paragraph } = Typography;

const ENFORCEMENT_OPTS = [
  { value: 'enforce', label: 'Enforce' },
  { value: 'warn', label: 'Warn' },
  { value: 'audit', label: 'Audit' },
];

export function ClisListPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [data, setData] = useState<CliCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<CreateCliPayload>();
  const [importOpen, setImportOpen] = useState(false);
  const [importContent, setImportContent] = useState('');
  const [importOverwrite, setImportOverwrite] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportCatalogResult | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await clisApi.list({ limit: 200 });
      setData(res.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Failed to load CLIs');
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
        c.vendor?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q),
    );
  }, [data, query]);

  const onExport = async () => {
    try {
      const yamlText = await clisApi.exportYaml();
      const blob = new Blob([yamlText], { type: 'application/yaml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shellpilot-clis-${new Date().toISOString().slice(0, 10)}.yaml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Export failed');
    }
  };

  const onImport = async () => {
    if (!importContent.trim()) {
      message.warning('Paste YAML content first');
      return;
    }
    setImportBusy(true);
    setImportResult(null);
    try {
      const result = await clisApi.importYaml(importContent, importOverwrite);
      setImportResult(result);
      const total = result.created.length + result.updated.length;
      if (total > 0) message.success(`Imported ${total} CLI${total === 1 ? '' : 's'}`);
      if (result.errors.length > 0) message.warning(`${result.errors.length} entries had errors`);
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Import failed');
    } finally {
      setImportBusy(false);
    }
  };

  const onCreate = async () => {
    try {
      const values = await form.validateFields();
      const created = await clisApi.create(values);
      message.success('CLI created');
      setCreateOpen(false);
      form.resetFields();
      await load();
      navigate(`/clis/${created.slug}`);
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Operation failed');
    }
  };

  return (
    <>
      <PageHeader
        title="CLIs Catalog"
        description="Command-line tools governed by ShellPilot. Open a CLI to edit its metadata and rules."
        extra={
          <Space>
            <Input
              prefix={<SearchOutlined />}
              placeholder="Search by slug, name, vendor…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              allowClear
              style={{ width: 280 }}
            />
            <Button icon={<DownloadOutlined />} onClick={onExport}>
              Export YAML
            </Button>
            <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
              Import
            </Button>
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              New CLI
            </Button>
          </Space>
        }
      />

      {filtered.length === 0 && !loading ? (
        <Empty description={query ? 'No CLIs match your search' : 'No CLIs yet'} />
      ) : (
        <Row gutter={[12, 12]}>
          {filtered.map((cli) => (
            <Col key={cli.id} xs={24} sm={12} md={8} lg={6} xxl={4}>
              <Card
                hoverable
                onClick={() => navigate(`/clis/${cli.slug}`)}
                styles={{ body: { padding: 12 } }}
              >
                <Space align="start" size={12} style={{ width: '100%' }}>
                  <CliLogo iconUrl={cli.iconUrl} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Space size={6} wrap>
                      <Text strong style={{ fontSize: 13 }}>
                        {cli.name}
                      </Text>
                      {!cli.active && <Tag>inactive</Tag>}
                    </Space>
                    <div>
                      <Text type="secondary" className="shellpilot-mono" style={{ fontSize: 11 }}>
                        {cli.slug}
                      </Text>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <EnforcementTag value={cli.defaultEnforcement} />
                    </div>
                  </div>
                </Space>
                {cli.description && (
                  <Paragraph
                    type="secondary"
                    ellipsis={{ rows: 2 }}
                    style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}
                  >
                    {cli.description}
                  </Paragraph>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Drawer
        width={640}
        open={createOpen}
        title="New CLI"
        onClose={() => {
          setCreateOpen(false);
          form.resetFields();
        }}
        extra={
          <Button type="primary" onClick={onCreate}>
            Create
          </Button>
        }
        destroyOnClose
      >
        <Form layout="vertical" form={form}>
          <Form.Item
            label="Slug"
            name="slug"
            rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9_-]*$/ }]}
          >
            <Input placeholder="gh" />
          </Form.Item>
          <Form.Item label="Name" name="name" rules={[{ required: true }]}>
            <Input placeholder="GitHub CLI" />
          </Form.Item>
          <Form.Item label="Vendor" name="vendor">
            <Input placeholder="GitHub Inc." />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            label="Logo URL"
            name="iconUrl"
            tooltip="Public PNG/SVG URL. Shown on the card and detail page."
          >
            <Input placeholder="https://…/github.svg" />
          </Form.Item>
          <CliAuthFields form={form} />
          <Form.Item label="Default enforcement" name="defaultEnforcement" initialValue="warn">
            <Select options={ENFORCEMENT_OPTS} />
          </Form.Item>
          <Form.Item label="Docs URL" name="docsUrl">
            <Input />
          </Form.Item>
          <Form.Item label="Active" name="active" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
          <Tabs
            items={[
              {
                key: 'mac',
                label: 'macOS',
                children: (
                  <Form.Item name={['installCommands', 'mac']}>
                    <Input.TextArea rows={3} placeholder="brew install gh" />
                  </Form.Item>
                ),
              },
              {
                key: 'linux',
                label: 'Linux',
                children: (
                  <Form.Item name={['installCommands', 'linux']}>
                    <Input.TextArea rows={3} placeholder="sudo apt install gh" />
                  </Form.Item>
                ),
              },
              {
                key: 'windows',
                label: 'Windows',
                children: (
                  <Form.Item name={['installCommands', 'windows']}>
                    <Input.TextArea rows={3} placeholder="winget install GitHub.cli" />
                  </Form.Item>
                ),
              },
            ]}
          />
        </Form>
      </Drawer>

      <Modal
        open={importOpen}
        title="Import catalog from YAML"
        width={720}
        onCancel={() => {
          setImportOpen(false);
          setImportContent('');
          setImportResult(null);
        }}
        onOk={onImport}
        confirmLoading={importBusy}
        okText="Import"
        destroyOnClose
      >
        <Paragraph type="secondary" style={{ marginBottom: 8 }}>
          Paste a list of CLIs in YAML. Top-level <Text code>- slug: …</Text> list or an object with
          a <Text code>clis:</Text> array. Existing slugs are skipped unless overwrite is enabled.
        </Paragraph>
        <Input.TextArea
          rows={12}
          value={importContent}
          onChange={(e) => setImportContent(e.target.value)}
          placeholder={`clis:\n  - slug: aws\n    name: AWS CLI\n    auth:\n      mode: env-multi\n      envVars: [AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY]`}
          style={{ fontFamily: 'var(--shellpilot-mono, monospace)' }}
        />
        <div style={{ marginTop: 8 }}>
          <Checkbox checked={importOverwrite} onChange={(e) => setImportOverwrite(e.target.checked)}>
            Overwrite existing entries with the same slug
          </Checkbox>
        </div>
        {importResult && (
          <Alert
            type={importResult.errors.length > 0 ? 'warning' : 'success'}
            style={{ marginTop: 12 }}
            message={
              <Space size={6} wrap>
                <Tag color="green">Created {importResult.created.length}</Tag>
                <Tag color="blue">Updated {importResult.updated.length}</Tag>
                <Tag>Skipped {importResult.skipped.length}</Tag>
                <Tag color="red">Errors {importResult.errors.length}</Tag>
              </Space>
            }
            description={
              importResult.errors.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {importResult.errors.map((err, i) => (
                    <li key={i}>
                      <Text code>{err.slug ?? '(no slug)'}</Text>: {err.reason}
                    </li>
                  ))}
                </ul>
              ) : null
            }
          />
        )}
      </Modal>
    </>
  );
}

export function CliLogo({ iconUrl, size = 28 }: { iconUrl?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (iconUrl && !broken) {
    return (
      <img
        src={iconUrl}
        alt=""
        width={size}
        height={size}
        onError={() => setBroken(true)}
        style={{ borderRadius: 6, objectFit: 'contain', background: '#0a0a0a', padding: 2 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        background: '#2f2f2f',
        borderRadius: 6,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#b3b3b3',
      }}
    >
      <FontAwesomeIcon icon={faTerminal} style={{ fontSize: size * 0.45 }} />
    </div>
  );
}
