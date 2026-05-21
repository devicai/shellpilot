import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
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
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { PageHeader } from '../../components/PageHeader';
import { clisApi, type UpdateCliPayload } from '../../api/endpoints/clis';
import { rulesApi, type CreateRulePayload } from '../../api/endpoints/rules';
import type { CliCatalogItem, Decision, Policy, Rule } from '../../types/api';
import { CliLogo } from './ClisList';

const { Text } = Typography;

const ENFORCEMENT_OPTS = [
  { value: 'enforce', label: 'Enforce' },
  { value: 'warn', label: 'Warn' },
  { value: 'audit', label: 'Audit' },
];

const DECISION_OPTS: { value: Decision; label: string }[] = [
  { value: 'allow', label: 'allow' },
  { value: 'deny', label: 'deny' },
  { value: 'requires-approval', label: 'requires-approval' },
];

const decisionColor = (d: Decision) =>
  d === 'allow' ? 'green' : d === 'deny' ? 'red' : 'gold';

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

  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [ruleForm] = Form.useForm<CreateRulePayload>();

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
        envVarHint: c.envVarHint,
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

  const openNewRule = () => {
    setEditingRule(null);
    ruleForm.resetFields();
    ruleForm.setFieldsValue({ cli: slug, effect: 'deny', priority: 0 });
    setRuleModalOpen(true);
  };

  const openEditRule = (r: Rule) => {
    setEditingRule(r);
    ruleForm.setFieldsValue({
      cli: r.cli,
      path: r.path,
      effect: r.effect,
      reason: r.reason,
      priority: r.priority,
    });
    setRuleModalOpen(true);
  };

  const onSubmitRule = async () => {
    if (!activePolicy) {
      message.error('No active policy. Create one in Settings first.');
      return;
    }
    try {
      const values = await ruleForm.validateFields();
      if (editingRule) {
        await rulesApi.updateRule(editingRule.id, values);
        message.success('Rule updated');
      } else {
        await rulesApi.createRule(activePolicy.id, values);
        message.success('Rule created');
      }
      setRuleModalOpen(false);
      setEditingRule(null);
      ruleForm.resetFields();
      await loadActivePolicyAndRules();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Operation failed');
    }
  };

  const onDeleteRule = async (r: Rule) => {
    try {
      await rulesApi.deleteRule(r.id);
      message.success('Rule deleted');
      await loadActivePolicyAndRules();
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

      <Row gutter={12}>
        <Col xs={24} lg={12}>
          <Card title="Metadata" size="small">
            <Form layout="vertical" form={form}>
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
              <Form.Item label="Env var hint" name="envVarHint">
                <Input placeholder="GH_TOKEN" />
              </Form.Item>
              <Form.Item label="Default enforcement" name="defaultEnforcement">
                <Select options={ENFORCEMENT_OPTS} />
              </Form.Item>
              <Form.Item label="Docs URL" name="docsUrl">
                <Input />
              </Form.Item>
              <Form.Item label="Active" name="active" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Form>
          </Card>

          <Card title="Install commands" size="small" style={{ marginTop: 12 }}>
            <Form layout="vertical" form={form}>
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
          </Card>
        </Col>

        <Col xs={24} lg={12}>
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
              <Button type="primary" size="small" onClick={openNewRule} disabled={!activePolicy}>
                New rule
              </Button>
            }
          >
            {!activePolicy ? (
              <Alert
                type="warning"
                showIcon
                message="No active policy"
                description="Create and activate a policy from Settings before adding rules."
              />
            ) : (
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
                    render: (v: Decision) => <Tag color={decisionColor(v)}>{v}</Tag>,
                  },
                  { title: 'Priority', dataIndex: 'priority', width: 70 },
                  {
                    title: '',
                    width: 110,
                    render: (_, r) => (
                      <Space>
                        <Button type="link" size="small" onClick={() => openEditRule(r)}>
                          Edit
                        </Button>
                        <Popconfirm title="Delete rule?" onConfirm={() => onDeleteRule(r)}>
                          <Button type="link" size="small" danger>
                            Delete
                          </Button>
                        </Popconfirm>
                      </Space>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        open={ruleModalOpen}
        title={editingRule ? 'Edit rule' : 'New rule'}
        onCancel={() => {
          setRuleModalOpen(false);
          setEditingRule(null);
          ruleForm.resetFields();
        }}
        onOk={onSubmitRule}
        okText={editingRule ? 'Save' : 'Create'}
        destroyOnClose
      >
        <Form layout="vertical" form={ruleForm}>
          <Form.Item
            label="CLI"
            name="cli"
            rules={[{ required: true }]}
            tooltip='Use "*" to apply to any CLI'
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Path"
            name="path"
            rules={[{ required: true }]}
            tooltip='Glob over the command path, e.g. "repo delete *"'
          >
            <Input placeholder="repo delete *" />
          </Form.Item>
          <Form.Item label="Effect" name="effect" rules={[{ required: true }]}>
            <Select options={DECISION_OPTS} />
          </Form.Item>
          <Form.Item label="Reason" name="reason">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="Priority" name="priority" initialValue={0}>
            <Input type="number" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
