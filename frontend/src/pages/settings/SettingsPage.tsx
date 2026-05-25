import { useEffect, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { CopyOutlined, KeyOutlined, ApiOutlined, SendOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { DecisionTag, EnforcementTag } from '../../components/PolicyTags';
import { apiKeysApi } from '../../api/endpoints/apiKeys';
import { rulesApi, WEBHOOK_EVENTS, type WebhookEvent } from '../../api/endpoints/rules';
import type { ApiKeyMeta, Decision, Enforcement, IssuedApiKey, Policy } from '../../types/api';

const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  on_deny: 'Deny',
  on_requires_approval: 'Requires approval',
  on_jit_issued: 'JIT issued',
  on_binary_missing: 'Binary missing',
};

const { Text, Paragraph } = Typography;

const INSTANCE_KEY_NAME = 'shellpilot-instance';

export function SettingsPage() {
  const { message } = AntApp.useApp();
  const [apiKey, setApiKey] = useState<ApiKeyMeta | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(true);
  const [issued, setIssued] = useState<IssuedApiKey | null>(null);

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);

  const [webhookPolicy, setWebhookPolicy] = useState<Policy | null>(null);
  const [webhookForm] = Form.useForm<{
    on_deny?: string;
    on_requires_approval?: string;
    on_jit_issued?: string;
    on_binary_missing?: string;
    webhookSecret?: string;
  }>();
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookTesting, setWebhookTesting] = useState<WebhookEvent | null>(null);

  const loadApiKey = async () => {
    setApiKeyLoading(true);
    try {
      const res = await apiKeysApi.list({ limit: 10 });
      // We treat ShellPilot as a single-instance product: the first active key
      // is "the" API key. If multiple exist (legacy installs) we still show the
      // most recently created one and ignore the rest.
      const active = res.data.find((k) => k.active) ?? res.data[0] ?? null;
      setApiKey(active);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Failed to load API key');
    } finally {
      setApiKeyLoading(false);
    }
  };

  const loadPolicies = async () => {
    setPoliciesLoading(true);
    try {
      const res = await rulesApi.listPolicies({ limit: 50 });
      setPolicies(res.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Failed to load policies');
    } finally {
      setPoliciesLoading(false);
    }
  };

  useEffect(() => {
    loadApiKey();
    loadPolicies();
  }, []);

  const onCreate = async () => {
    try {
      const k = await apiKeysApi.create({ name: INSTANCE_KEY_NAME });
      setIssued(k);
      await loadApiKey();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Create failed');
    }
  };

  const onRotate = async () => {
    if (!apiKey) return;
    try {
      const k = await apiKeysApi.rotate(apiKey.id);
      setIssued(k);
      await loadApiKey();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Rotate failed');
    }
  };

  const onRevoke = async () => {
    if (!apiKey) return;
    try {
      await apiKeysApi.revoke(apiKey.id);
      message.success('API key revoked');
      await loadApiKey();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Revoke failed');
    }
  };

  const onActivate = async (p: Policy) => {
    try {
      await rulesApi.activatePolicy(p.id);
      message.success(`Activated ${p.name}`);
      await loadPolicies();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Activate failed');
    }
  };

  const onDeletePolicy = async (p: Policy) => {
    try {
      await rulesApi.deletePolicy(p.id);
      message.success('Policy deleted');
      await loadPolicies();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Delete failed');
    }
  };

  const openWebhooks = (p: Policy) => {
    setWebhookPolicy(p);
    webhookForm.setFieldsValue({
      on_deny: p.webhooks?.on_deny,
      on_requires_approval: p.webhooks?.on_requires_approval,
      on_jit_issued: p.webhooks?.on_jit_issued,
      on_binary_missing: p.webhooks?.on_binary_missing,
      webhookSecret: p.webhookSecret,
    });
  };

  const saveWebhooks = async () => {
    if (!webhookPolicy) return;
    const values = await webhookForm.validateFields();
    const webhooks: Record<string, string> = {};
    for (const evt of WEBHOOK_EVENTS) {
      const url = values[evt]?.trim();
      if (url) webhooks[evt] = url;
    }
    setWebhookSaving(true);
    try {
      await rulesApi.updatePolicy(webhookPolicy.id, {
        webhooks,
        webhookSecret: values.webhookSecret?.trim() || undefined,
      });
      message.success('Webhooks saved');
      setWebhookPolicy(null);
      await loadPolicies();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Save failed');
    } finally {
      setWebhookSaving(false);
    }
  };

  const sendTestWebhook = async (event: WebhookEvent) => {
    if (!webhookPolicy) return;
    setWebhookTesting(event);
    try {
      const result = await rulesApi.testWebhook(webhookPolicy.id, event);
      const ok = result.status >= 200 && result.status < 300;
      message[ok ? 'success' : 'warning'](
        `Test ${event} → ${result.status}${result.body ? `: ${result.body.slice(0, 80)}` : ''}`,
      );
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Test failed');
    } finally {
      setWebhookTesting(null);
    }
  };

  const onCreatePolicy = async () => {
    try {
      await rulesApi.createPolicy({ name: `policy-${Date.now()}` });
      message.success('Policy created');
      await loadPolicies();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Create failed');
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Instance-wide configuration for ShellPilot" />

      <Card
        title={
          <Space>
            <KeyOutlined />
            <span>API Key</span>
          </Space>
        }
        size="small"
        style={{ marginBottom: 16 }}
        loading={apiKeyLoading}
      >
        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          ShellPilot uses a <Text strong>single API key per instance</Text>. The Go wrapper
          (<Text className="shellpilot-mono">devic-cli-wrapper</Text>) on each developer
          workstation authenticates against this backend with it. Run once per install:
        </Paragraph>
        <pre
          className="shellpilot-mono"
          style={{
            background: '#0a0a0a',
            border: '1px solid #424242',
            padding: 10,
            borderRadius: 6,
            margin: 0,
            marginBottom: 12,
            fontSize: 12,
          }}
        >{`devic-cli-wrapper auth <BACKEND_URL> <API_KEY>`}</pre>

        {apiKey ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space wrap>
              <Text>Active key:</Text>
              <Text className="shellpilot-mono">shp_{apiKey.prefix}…</Text>
              {apiKey.active ? <Tag color="green">active</Tag> : <Tag>inactive</Tag>}
            </Space>
            <Space wrap>
              <Text type="secondary">
                Created:{' '}
                <Text className="shellpilot-mono">
                  {dayjs(apiKey.createdAt).format('YYYY-MM-DD HH:mm')}
                </Text>
              </Text>
              <Text type="secondary">
                Last used:{' '}
                <Text className="shellpilot-mono">
                  {apiKey.lastUsedAt
                    ? dayjs(apiKey.lastUsedAt).format('YYYY-MM-DD HH:mm')
                    : 'never'}
                </Text>
              </Text>
            </Space>
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 6 }}
              message="Only the prefix is stored"
              description={
                <>
                  The full token is shown <Text strong>only when the key is created or rotated</Text>.
                  If you lost it, click <Text strong>Rotate</Text> below to issue a fresh one — the
                  previous key stops working immediately and every workstation must re-run
                  <Text className="shellpilot-mono"> devic-cli-wrapper auth</Text>.
                </>
              }
            />
            <Space style={{ marginTop: 6 }}>
              <Popconfirm
                title="Rotate API key?"
                description="The previous key stops working immediately. Re-run `devic-cli-wrapper auth` on every install."
                onConfirm={onRotate}
              >
                <Button type="primary">Rotate &amp; reveal new key</Button>
              </Popconfirm>
              <Popconfirm
                title="Revoke API key?"
                description="All wrappers will stop reaching the backend until a new key is issued."
                onConfirm={onRevoke}
              >
                <Button danger>Revoke</Button>
              </Popconfirm>
            </Space>
          </Space>
        ) : (
          <div
            style={{
              border: '1px dashed #424242',
              borderRadius: 6,
              padding: 16,
              textAlign: 'center',
            }}
          >
            <Space direction="vertical" align="center" size={8}>
              <Text type="secondary">No API key issued yet for this instance.</Text>
              <Button type="primary" size="large" onClick={onCreate}>
                Issue API key
              </Button>
              <Text type="secondary" style={{ fontSize: 12 }}>
                The full token will be shown once. Copy it before closing the dialog.
              </Text>
            </Space>
          </div>
        )}
      </Card>

      <Card
        title="Policies"
        size="small"
        extra={
          <Button type="primary" size="small" onClick={onCreatePolicy}>
            New policy
          </Button>
        }
      >
        <Table<Policy>
          rowKey="id"
          size="small"
          loading={policiesLoading}
          dataSource={policies}
          pagination={false}
          columns={[
            { title: 'Name', dataIndex: 'name' },
            {
              title: 'Default effect',
              dataIndex: 'defaultEffect',
              width: 140,
              render: (v: Decision) => <DecisionTag value={v} />,
            },
            {
              title: 'Enforcement',
              dataIndex: 'enforcement',
              width: 130,
              render: (v: Enforcement) => <EnforcementTag value={v} />,
            },
            { title: 'Version', dataIndex: 'version', width: 90 },
            {
              title: 'Active',
              dataIndex: 'active',
              width: 90,
              render: (v) => (v ? <Tag color="green">active</Tag> : null),
            },
            {
              title: 'Webhooks',
              width: 100,
              render: (_, r) => {
                const count = Object.values(r.webhooks ?? {}).filter(Boolean).length;
                return (
                  <Button type="link" size="small" onClick={() => openWebhooks(r)}>
                    {count > 0 ? `${count} configured` : 'Configure'}
                  </Button>
                );
              },
            },
            {
              title: 'Actions',
              width: 180,
              render: (_, r) => (
                <Space>
                  {!r.active && (
                    <Button type="link" size="small" onClick={() => onActivate(r)}>
                      Activate
                    </Button>
                  )}
                  <Popconfirm title="Delete policy and all its rules?" onConfirm={() => onDeletePolicy(r)}>
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

      <Modal
        open={!!issued}
        title="API key issued"
        onCancel={() => setIssued(null)}
        footer={[
          <Button key="done" type="primary" onClick={() => setIssued(null)}>
            Done
          </Button>,
        ]}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Copy the key now"
          description="ShellPilot stores only a hash. You won't be able to see this key again — rotate if lost."
        />
        <pre
          className="shellpilot-mono"
          style={{
            background: '#0a0a0a',
            border: '1px solid #424242',
            padding: 10,
            borderRadius: 6,
            margin: 0,
            wordBreak: 'break-all',
            whiteSpace: 'pre-wrap',
            fontSize: 12,
          }}
        >
          {issued?.token}
        </pre>
        <Button
          icon={<CopyOutlined />}
          style={{ marginTop: 10 }}
          onClick={() => {
            if (issued?.token) {
              navigator.clipboard.writeText(issued.token);
              message.success('Copied to clipboard');
            }
          }}
        >
          Copy
        </Button>
      </Modal>

      <Drawer
        width={520}
        open={!!webhookPolicy}
        title={
          <Space>
            <ApiOutlined />
            <span>Webhooks — {webhookPolicy?.name}</span>
          </Space>
        }
        onClose={() => setWebhookPolicy(null)}
        extra={
          <Button type="primary" loading={webhookSaving} onClick={saveWebhooks}>
            Save
          </Button>
        }
        destroyOnClose
      >
        <Paragraph type="secondary">
          ShellPilot forwards selected trace events to your URL with a JSON body. Set a shared
          secret to verify requests via the <Text className="shellpilot-mono">X-ShellPilot-Signature</Text>{' '}
          header (sha256 HMAC of the body).
        </Paragraph>
        <Form form={webhookForm} layout="vertical">
          {WEBHOOK_EVENTS.map((evt) => (
            <Form.Item
              key={evt}
              label={
                <Space>
                  <Tag>{evt}</Tag>
                  <Text>{WEBHOOK_EVENT_LABELS[evt]}</Text>
                </Space>
              }
              name={evt}
            >
              <Input.Search
                placeholder="https://hooks.slack.com/services/…"
                enterButton={
                  <Button
                    icon={<SendOutlined />}
                    loading={webhookTesting === evt}
                    type="default"
                  >
                    Test
                  </Button>
                }
                onSearch={() => sendTestWebhook(evt)}
              />
            </Form.Item>
          ))}
          <Form.Item
            name="webhookSecret"
            label="Shared HMAC secret"
            tooltip="Used to sign every outgoing webhook body."
          >
            <Input.Password placeholder="(no secret — payloads ship unsigned)" />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
