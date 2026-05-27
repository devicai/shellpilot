import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Form,
  Input,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { PageHeader } from '../../components/PageHeader';
import { DecisionTag } from '../../components/PolicyTags';
import { CliAuthFields } from '../../components/CliAuthFields';
import { clisApi, type UpdateCliPayload } from '../../api/endpoints/clis';
import { rulesApi } from '../../api/endpoints/rules';
import type { CliCatalogItem, Decision, Policy, Rule } from '../../types/api';
import { CliLogo } from './ClisList';

const { Text } = Typography;

const ENFORCEMENT_OPTS = [
  { value: 'enforce', label: 'Enforce' },
  { value: 'warn', label: 'Warn' },
  { value: 'audit', label: 'Audit' },
];

export function CliDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [cli, setCli] = useState<CliCatalogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<UpdateCliPayload>();

  const [activePolicy, setActivePolicy] = useState<Policy | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);

  const cliRules = useMemo(
    () => rules.filter((r) => r.cli === slug || r.cli === '*'),
    [rules, slug],
  );

  const loadCli = async () => {
    setLoading(true);
    try {
      const c = await clisApi.get(slug);
      setCli(c);
      form.setFieldsValue({
        name: c.name,
        vendor: c.vendor,
        description: c.description,
        auth: c.auth ?? { mode: 'env' },
        defaultEnforcement: c.defaultEnforcement,
        installCommands: c.installCommands,
        docsUrl: c.docsUrl,
        iconUrl: c.iconUrl,
        icon: c.icon,
        active: c.active,
      });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Failed to load CLI');
    } finally {
      setLoading(false);
    }
  };

  const loadActivePolicyAndRules = async () => {
    setRulesLoading(true);
    try {
      const res = await rulesApi.listPolicies({ limit: 50 });
      const active = res.data.find((p) => p.active) ?? res.data[0] ?? null;
      setActivePolicy(active);
      if (active) {
        const rs = await rulesApi.listRules(active.id);
        setRules(rs);
      } else {
        setRules([]);
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Failed to load rules');
    } finally {
      setRulesLoading(false);
    }
  };

  useEffect(() => {
    loadCli();
    loadActivePolicyAndRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const onSave = async () => {
    if (!cli) return;
    setSaving(true);
    try {
      const values = await form.validateFields();
      const updated = await clisApi.update(cli.id, values);
      setCli(updated);
      message.success('Saved');
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!cli) return;
    try {
      await clisApi.remove(cli.id);
      message.success('CLI deleted');
      navigate('/clis');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Delete failed');
    }
  };

  if (loading && !cli) {
    return <Spin />;
  }

  if (!cli) {
    return <Alert type="error" message="CLI not found" showIcon />;
  }

  return (
    <>
      <PageHeader
        title={
          <Space size={12} align="center">
            <CliLogo iconUrl={cli.iconUrl} size={36} />
            <span>{cli.name}</span>
            <Text type="secondary" className="shellpilot-mono" style={{ fontSize: 12 }}>
              {cli.slug}
            </Text>
          </Space>
        }
        description={cli.description || cli.vendor}
        extra={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/clis')}>
              Back
            </Button>
            <Popconfirm title={`Delete ${cli.slug}?`} onConfirm={onDelete}>
              <Button danger>Delete</Button>
            </Popconfirm>
            <Button type="primary" loading={saving} onClick={onSave}>
              Save
            </Button>
          </Space>
        }
      />

      <Card title="Metadata" size="small" style={{ marginBottom: 12 }}>
        <Form layout="vertical" form={form}>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item label="Name" name="name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item label="Vendor" name="vendor">
                <Input />
              </Form.Item>
              <Form.Item label="Description" name="description">
                <Input.TextArea rows={2} />
              </Form.Item>
              <Form.Item label="Logo URL" name="iconUrl">
                <Input placeholder="https://…/github.svg" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <CliAuthFields form={form} />
              <Form.Item label="Default enforcement" name="defaultEnforcement">
                <Select options={ENFORCEMENT_OPTS} />
              </Form.Item>
              <Form.Item label="Docs URL" name="docsUrl">
                <Input />
              </Form.Item>
              <Form.Item label="Active" name="active" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Install commands
            </Text>
            <Tabs
              size="small"
              items={[
                {
                  key: 'mac',
                  label: 'macOS',
                  children: (
                    <Form.Item name={['installCommands', 'mac']} noStyle>
                      <Input.TextArea rows={3} placeholder="brew install gh" />
                    </Form.Item>
                  ),
                },
                {
                  key: 'linux',
                  label: 'Linux',
                  children: (
                    <Form.Item name={['installCommands', 'linux']} noStyle>
                      <Input.TextArea rows={3} placeholder="sudo apt install gh" />
                    </Form.Item>
                  ),
                },
                {
                  key: 'windows',
                  label: 'Windows',
                  children: (
                    <Form.Item name={['installCommands', 'windows']} noStyle>
                      <Input.TextArea rows={3} placeholder="winget install GitHub.cli" />
                    </Form.Item>
                  ),
                },
              ]}
            />
          </div>
        </Form>
      </Card>

      <Card
        title={
          <Space>
            <span>Rules</span>
            {activePolicy && (
              <Tag color="blue">
                policy: {activePolicy.name} v{activePolicy.version}
              </Tag>
            )}
          </Space>
        }
        size="small"
        extra={
          activePolicy && (
            <Link to={`/policies/${activePolicy.id}`}>Edit in Policies →</Link>
          )
        }
      >
        {!activePolicy ? (
          <Alert
            type="info"
            showIcon
            message="No active policy"
            description={<>Rules are managed per policy. Go to <Link to="/policies">Policies</Link> to create one.</>}
          />
        ) : (
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={<>Read-only view of rules touching <Text code>{slug}</Text> in the active policy. Edit them in <Link to={`/policies/${activePolicy.id}`}>Policies</Link>.</>}
            />
            <Table<Rule>
              size="small"
              rowKey="id"
              loading={rulesLoading}
              pagination={false}
              dataSource={cliRules}
              locale={{ emptyText: 'No rules for this CLI yet' }}
              columns={[
                {
                  title: 'Path',
                  dataIndex: 'path',
                  render: (v, r) => (
                    <Space size={4}>
                      {r.cli === '*' && <Tag>any CLI</Tag>}
                      <Text className="shellpilot-mono" style={{ fontSize: 12 }}>
                        {v}
                      </Text>
                    </Space>
                  ),
                },
                {
                  title: 'Effect',
                  dataIndex: 'effect',
                  width: 140,
                  render: (v: Decision) => <DecisionTag value={v} />,
                },
                { title: 'Reason', dataIndex: 'reason', ellipsis: true },
                { title: 'Priority', dataIndex: 'priority', width: 80 },
              ]}
            />
          </>
        )}
      </Card>
    </>
  );
}
