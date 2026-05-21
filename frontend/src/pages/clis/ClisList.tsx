import { useEffect, useMemo, useState } from 'react';
import {
  App as AntApp,
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Form,
  Input,
  Row,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import { SearchOutlined } from '@ant-design/icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTerminal } from '@fortawesome/free-solid-svg-icons';
import { PageHeader } from '../../components/PageHeader';
import { clisApi, type CreateCliPayload } from '../../api/endpoints/clis';
import type { CliCatalogItem } from '../../types/api';

const { Text, Paragraph } = Typography;

const ENFORCEMENT_OPTS = [
  { value: 'enforce', label: 'Enforce' },
  { value: 'warn', label: 'Warn' },
  { value: 'audit', label: 'Audit' },
];

const ENFORCEMENT_COLORS: Record<string, string> = {
  enforce: 'red',
  warn: 'gold',
  audit: 'default',
};

export function ClisListPage() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [data, setData] = useState<CliCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<CreateCliPayload>();

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
                      <Tag color={ENFORCEMENT_COLORS[cli.defaultEnforcement] ?? 'default'}>
                        {cli.defaultEnforcement}
                      </Tag>
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
          <Form.Item label="Env var hint" name="envVarHint">
            <Input placeholder="GH_TOKEN" />
          </Form.Item>
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
