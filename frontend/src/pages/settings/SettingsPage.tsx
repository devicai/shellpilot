import { useEffect, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Empty,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { CopyOutlined, KeyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { apiKeysApi } from '../../api/endpoints/apiKeys';
import { rulesApi } from '../../api/endpoints/rules';
import type { ApiKeyMeta, IssuedApiKey, Policy } from '../../types/api';

const { Text, Paragraph } = Typography;

const INSTANCE_KEY_NAME = 'shellpilot-instance';

export function SettingsPage() {
  const { message } = AntApp.useApp();
  const [apiKey, setApiKey] = useState<ApiKeyMeta | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(true);
  const [issued, setIssued] = useState<IssuedApiKey | null>(null);

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);

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
          (<Text className="shellpilot-mono">devic-cli-wrapper</Text>) running on each developer
          workstation authenticates against this backend with it. Configure each install with:
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
              <Text>Prefix:</Text>
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
                  {apiKey.lastUsedAt ? dayjs(apiKey.lastUsedAt).format('YYYY-MM-DD HH:mm') : 'never'}
                </Text>
              </Text>
            </Space>
            <Space style={{ marginTop: 6 }}>
              <Popconfirm
                title="Rotate API key?"
                description="The previous key stops working immediately. Re-run `devic-cli-wrapper auth` on every install."
                onConfirm={onRotate}
              >
                <Button>Rotate</Button>
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
          <Empty
            description={
              <Space direction="vertical" align="center">
                <Text type="secondary">No API key issued yet.</Text>
                <Button type="primary" onClick={onCreate}>
                  Issue API key
                </Button>
              </Space>
            }
          />
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
            { title: 'Default effect', dataIndex: 'defaultEffect', width: 140 },
            { title: 'Enforcement', dataIndex: 'enforcement', width: 130 },
            { title: 'Version', dataIndex: 'version', width: 90 },
            {
              title: 'Active',
              dataIndex: 'active',
              width: 90,
              render: (v) => (v ? <Tag color="green">active</Tag> : null),
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
    </>
  );
}
