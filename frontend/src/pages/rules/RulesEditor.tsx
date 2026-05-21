import { useEffect, useMemo, useState } from 'react';
import {
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
  Table,
  Tag,
  Typography,
} from 'antd';
import Editor from '@monaco-editor/react';
import * as YAML from 'js-yaml';
import { PageHeader } from '../../components/PageHeader';
import { rulesApi, type CreateRulePayload } from '../../api/endpoints/rules';
import type { Decision, Enforcement, EvaluationResult, Policy, Rule } from '../../types/api';

const { Text } = Typography;

const DECISION_OPTS: { value: Decision; label: string }[] = [
  { value: 'allow', label: 'allow' },
  { value: 'deny', label: 'deny' },
  { value: 'requires-approval', label: 'requires-approval' },
];

const ENFORCEMENT_OPTS: { value: Enforcement; label: string }[] = [
  { value: 'enforce', label: 'enforce' },
  { value: 'warn', label: 'warn' },
  { value: 'audit', label: 'audit' },
];

function policyToYaml(p: Policy, rules: Rule[]): string {
  return YAML.dump(
    {
      name: p.name,
      description: p.description,
      defaultEffect: p.defaultEffect,
      enforcement: p.enforcement,
      clis: p.clis,
      webhooks: p.webhooks,
      active: p.active,
      version: p.version,
      rules: rules.map(({ id: _id, policyId: _pid, createdAt: _c, updatedAt: _u, ...rest }) => rest),
    },
    { lineWidth: 100 },
  );
}

export function RulesEditorPage() {
  const { message } = AntApp.useApp();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [activePolicyId, setActivePolicyId] = useState<string | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [yamlText, setYamlText] = useState('');
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [ruleForm] = Form.useForm<CreateRulePayload>();
  const [evalCmd, setEvalCmd] = useState('gh repo delete my-repo');
  const [evalResult, setEvalResult] = useState<EvaluationResult | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  const activePolicy = useMemo(
    () => policies.find((p) => p.id === activePolicyId) ?? null,
    [policies, activePolicyId],
  );

  const loadAll = async () => {
    setLoading(true);
    try {
      const res = await rulesApi.listPolicies({ limit: 50 });
      setPolicies(res.data);
      if (res.data.length > 0) {
        const active = res.data.find((p) => p.active) ?? res.data[0];
        setActivePolicyId(active.id);
      } else {
        setActivePolicyId(null);
        setRules([]);
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Failed to load policies');
    } finally {
      setLoading(false);
    }
  };

  const loadRules = async (policyId: string) => {
    try {
      const list = await rulesApi.listRules(policyId);
      setRules(list);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Failed to load rules');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (activePolicyId) loadRules(activePolicyId);
  }, [activePolicyId]);

  useEffect(() => {
    if (activePolicy) {
      setYamlText(policyToYaml(activePolicy, rules));
    } else {
      setYamlText('');
    }
  }, [activePolicy, rules]);

  const createPolicy = async () => {
    Modal.confirm({
      title: 'Create new policy',
      content: 'A new empty policy will be created with default settings.',
      onOk: async () => {
        try {
          const p = await rulesApi.createPolicy({ name: `policy-${Date.now()}` });
          message.success('Policy created');
          await loadAll();
          setActivePolicyId(p.id);
        } catch (e: unknown) {
          const err = e as { response?: { data?: { message?: string } } };
          message.error(err.response?.data?.message ?? 'Create failed');
        }
      },
    });
  };

  const activate = async () => {
    if (!activePolicy) return;
    await rulesApi.activatePolicy(activePolicy.id);
    message.success('Policy activated');
    await loadAll();
  };

  const updateMeta = async (
    patch: Partial<{
      name: string;
      description?: string;
      defaultEffect: Decision;
      enforcement: Enforcement;
    }>,
  ) => {
    if (!activePolicy) return;
    try {
      const updated = await rulesApi.updatePolicy(activePolicy.id, patch);
      setPolicies((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Update failed');
    }
  };

  const onSubmitRule = async () => {
    if (!activePolicy) return;
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
      await loadRules(activePolicy.id);
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Operation failed');
    }
  };

  const runEvaluate = async () => {
    if (!activePolicy) return;
    setEvalLoading(true);
    try {
      const segs = evalCmd.trim().split(/\s+/);
      if (segs.length < 1) return;
      const [cli, ...args] = segs;
      const res = await rulesApi.evaluate(cli, args, activePolicy.id);
      setEvalResult(res);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Evaluate failed');
    } finally {
      setEvalLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Rules"
        description="Authorization policy applied by the Go wrapper before each CLI command"
        extra={
          <Space>
            <Select
              value={activePolicyId ?? undefined}
              style={{ width: 240 }}
              placeholder="Select policy"
              onChange={setActivePolicyId}
              loading={loading}
              options={policies.map((p) => ({
                value: p.id,
                label: (
                  <span>
                    {p.name} {p.active && <Tag color="green">active</Tag>}
                  </span>
                ),
              }))}
            />
            <Button onClick={createPolicy}>New policy</Button>
            <Button type="primary" disabled={!activePolicy || activePolicy.active} onClick={activate}>
              Activate
            </Button>
          </Space>
        }
      />

      {activePolicy && (
        <Row gutter={16}>
          <Col span={12}>
            <Card title="Policy (YAML preview)" size="small">
              <Editor
                height="520px"
                language="yaml"
                value={yamlText}
                theme="vs-dark"
                options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card
              size="small"
              title="Enforcement"
              extra={
                <Space>
                  <Text>Default effect</Text>
                  <Select
                    size="small"
                    value={activePolicy.defaultEffect}
                    options={DECISION_OPTS}
                    onChange={(v) => updateMeta({ defaultEffect: v })}
                  />
                  <Text>Mode</Text>
                  <Select
                    size="small"
                    value={activePolicy.enforcement}
                    options={ENFORCEMENT_OPTS}
                    onChange={(v) => updateMeta({ enforcement: v })}
                  />
                </Space>
              }
            >
              <Input.TextArea
                rows={2}
                value={evalCmd}
                onChange={(e) => setEvalCmd(e.target.value)}
                className="shellpilot-mono"
                placeholder="gh repo delete my-repo"
              />
              <Space style={{ marginTop: 8 }}>
                <Button type="primary" onClick={runEvaluate} loading={evalLoading}>
                  Evaluate
                </Button>
                {evalResult && (
                  <Tag
                    color={
                      evalResult.decision === 'allow'
                        ? 'green'
                        : evalResult.decision === 'deny'
                          ? 'red'
                          : 'gold'
                    }
                  >
                    {evalResult.decision}
                  </Tag>
                )}
                {evalResult?.matchedRule && (
                  <Text type="secondary">matched: {evalResult.matchedRule.path}</Text>
                )}
              </Space>
            </Card>

            <Card
              size="small"
              title="Rules"
              style={{ marginTop: 12 }}
              extra={
                <Button
                  type="primary"
                  onClick={() => {
                    setEditingRule(null);
                    ruleForm.resetFields();
                    setRuleModalOpen(true);
                  }}
                >
                  New rule
                </Button>
              }
            >
              <Table<Rule>
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={rules}
                columns={[
                  { title: 'CLI', dataIndex: 'cli', render: (v) => <Tag color="blue">{v}</Tag> },
                  { title: 'Path', dataIndex: 'path', render: (v) => <Text className="shellpilot-mono">{v}</Text> },
                  {
                    title: 'Effect',
                    dataIndex: 'effect',
                    render: (v: Decision) => (
                      <Tag color={v === 'allow' ? 'green' : v === 'deny' ? 'red' : 'gold'}>{v}</Tag>
                    ),
                  },
                  { title: 'Priority', dataIndex: 'priority', width: 70 },
                  { title: 'Reason', dataIndex: 'reason' },
                  {
                    title: 'Actions',
                    render: (_, r) => (
                      <Space>
                        <Button
                          type="link"
                          size="small"
                          onClick={() => {
                            setEditingRule(r);
                            ruleForm.setFieldsValue(r);
                            setRuleModalOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Popconfirm
                          title="Delete rule?"
                          onConfirm={async () => {
                            await rulesApi.deleteRule(r.id);
                            if (activePolicyId) await loadRules(activePolicyId);
                          }}
                        >
                          <Button type="link" size="small" danger>
                            Delete
                          </Button>
                        </Popconfirm>
                      </Space>
                    ),
                  },
                ]}
              />
            </Card>
          </Col>
        </Row>
      )}

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
          <Form.Item label="CLI" name="cli" rules={[{ required: true }]}>
            <Input placeholder='gh   (or * for any)' />
          </Form.Item>
          <Form.Item label="Path" name="path" rules={[{ required: true }]}>
            <Input placeholder='repo delete *' />
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
