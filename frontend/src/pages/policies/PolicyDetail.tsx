import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  App, Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { rulesApi, WEBHOOK_EVENTS, type WebhookEvent } from '../../api/endpoints/rules';
import { clisApi } from '../../api/endpoints/clis';
import { DecisionTag } from '../../components/PolicyTags';
import { DefaultEffectControl } from '../../components/DefaultEffectControl';
import type { CliCatalogItem, Enforcement, Policy, Rule } from '../../types/api';

const { Title, Text } = Typography;
const ENFORCEMENTS: Enforcement[] = ['enforce', 'warn', 'audit'];
const WEBHOOK_LABELS: Record<WebhookEvent, string> = {
  on_deny: 'On deny',
  on_requires_approval: 'On requires-approval',
  on_jit_issued: 'On JIT issued',
  on_binary_missing: 'On binary missing',
};

export function PolicyDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [clis, setClis] = useState<CliCatalogItem[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [metaForm] = Form.useForm();
  const [ruleModal, setRuleModal] = useState<{ open: boolean; editing?: Rule }>({ open: false });
  const [ruleForm] = Form.useForm();
  const [webhookForm] = Form.useForm();

  const load = async () => {
    const [p, clisRes, rulesRes] = await Promise.all([
      rulesApi.getPolicy(id),
      clisApi.list({ limit: 200 }),
      rulesApi.listRules(id),
    ]);
    setPolicy(p);
    setClis(clisRes.data);
    setRules(rulesRes);
    metaForm.setFieldsValue({
      name: p.name, description: p.description, defaultEffect: p.defaultEffect,
      enforcement: p.enforcement, clis: p.clis ?? [],
    });
    webhookForm.setFieldsValue({ ...(p.webhooks ?? {}), webhookSecret: p.webhookSecret });
  };
  useEffect(() => {
    void load();
  }, [id]);

  const saveMeta = async () => {
    const v = await metaForm.validateFields();
    await rulesApi.updatePolicy(id, v);
    message.success('Policy saved');
    void load();
  };

  const activate = async () => {
    await rulesApi.activatePolicy(id);
    message.success('Policy activated');
    void load();
  };

  const saveRule = async () => {
    const v = await ruleForm.validateFields();
    if (ruleModal.editing) await rulesApi.updateRule(ruleModal.editing.id, v);
    else await rulesApi.createRule(id, v);
    setRuleModal({ open: false });
    void load();
  };

  const saveWebhooks = async () => {
    const v = await webhookForm.validateFields();
    const { webhookSecret, ...webhooks } = v;
    await rulesApi.updatePolicy(id, { webhooks, webhookSecret });
    message.success('Webhooks saved');
  };

  if (!policy) return null;

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          {policy.name} {policy.active && <Tag color="green">active</Tag>}
        </Title>
        <Space>
          {!policy.active && <Button onClick={activate}>Set as global fallback</Button>}
          <Button onClick={() => navigate('/policies')}>Back</Button>
        </Space>
      </Space>

      <Card title="Policy" style={{ marginBottom: 16 }} extra={<Button type="primary" onClick={saveMeta}>Save</Button>}>
        <Form form={metaForm} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
          <Space size="large" style={{ display: 'flex' }}>
            <Form.Item name="defaultEffect" label="Default effect">
              <DefaultEffectControl />
            </Form.Item>
            <Form.Item name="enforcement" label="Enforcement" style={{ minWidth: 200 }}>
              <Select options={ENFORCEMENTS.map((e) => ({ value: e, label: e }))} />
            </Form.Item>
          </Space>
          <Form.Item name="clis" label="CLIs governed by this policy" tooltip="The CLIs the wrapper installs/shims for this policy">
            <Select
              mode="multiple"
              allowClear
              placeholder="Select CLIs"
              options={clis.map((c) => ({ value: c.slug, label: `${c.name} (${c.slug})` }))}
            />
          </Form.Item>
        </Form>
      </Card>

      <Card
        title="Rules"
        style={{ marginBottom: 16 }}
        extra={<Button icon={<PlusOutlined />} onClick={() => { ruleForm.resetFields(); ruleForm.setFieldsValue({ effect: 'deny', priority: 0 }); setRuleModal({ open: true }); }}>New rule</Button>}
      >
        <Table<Rule>
          rowKey="id"
          dataSource={rules}
          pagination={false}
          columns={[
            { title: 'CLI', dataIndex: 'cli', render: (c) => <Text code>{c}</Text> },
            { title: 'Path', dataIndex: 'path', render: (p) => <Text code>{p}</Text> },
            { title: 'Effect', dataIndex: 'effect', render: (e) => <DecisionTag value={e} /> },
            { title: 'Reason', dataIndex: 'reason' },
            { title: 'Priority', dataIndex: 'priority' },
            {
              title: 'Actions',
              render: (_, r) => (
                <Space>
                  <Button size="small" onClick={() => { ruleForm.setFieldsValue(r); setRuleModal({ open: true, editing: r }); }}>Edit</Button>
                  <Popconfirm title="Delete rule?" onConfirm={async () => { await rulesApi.deleteRule(r.id); void load(); }}>
                    <Button size="small" danger>Delete</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Card title="Webhooks" extra={<Button onClick={saveWebhooks}>Save webhooks</Button>}>
        <Form form={webhookForm} layout="vertical">
          {WEBHOOK_EVENTS.map((ev) => (
            <Form.Item key={ev} name={ev} label={WEBHOOK_LABELS[ev]}>
              <Input placeholder="https://…" allowClear />
            </Form.Item>
          ))}
          <Form.Item name="webhookSecret" label="Signing secret (HMAC)"><Input.Password allowClear /></Form.Item>
        </Form>
      </Card>

      <Modal
        title={ruleModal.editing ? 'Edit rule' : 'New rule'}
        open={ruleModal.open}
        onCancel={() => setRuleModal({ open: false })}
        onOk={saveRule}
        destroyOnClose
      >
        <Form form={ruleForm} layout="vertical">
          <Form.Item name="cli" label="CLI" rules={[{ required: true }]} tooltip="CLI slug, or * for any">
            <Select
              showSearch
              options={[{ value: '*', label: '* (any CLI)' }, ...clis.map((c) => ({ value: c.slug, label: c.slug }))]}
            />
          </Form.Item>
          <Form.Item name="path" label="Path" rules={[{ required: true }]} tooltip="Space-separated, wildcards * / ** (e.g. 'repo delete *')">
            <Input placeholder="repo delete *" />
          </Form.Item>
          <Form.Item name="effect" label="Effect" rules={[{ required: true }]}>
            <DefaultEffectControl />
          </Form.Item>
          <Form.Item name="reason" label="Reason"><Input /></Form.Item>
          <Form.Item name="priority" label="Priority"><InputNumber min={0} /></Form.Item>
        </Form>
      </Modal>

      <Text type="secondary">
        Rules are edited here, in one place. CLI pages link back here via <Link to="/policies">Policies</Link>.
      </Text>
    </div>
  );
}
