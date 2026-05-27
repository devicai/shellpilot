import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App as AntApp, Button, Card, Input, Popconfirm, Space, Tag, Typography } from 'antd';
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
  const [loading, setLoading] = useState(true);
  const [issued, setIssued] = useState<IssuedApiKey | null>(null);
  const [activePolicy, setActivePolicy] = useState<Policy | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [keys, pols] = await Promise.all([
        apiKeysApi.list({ limit: 50 }),
        rulesApi.listPolicies({ limit: 100 }),
      ]);
      setApiKey(keys.data.find((k) => k.name === INSTANCE_KEY_NAME) ?? keys.data[0] ?? null);
      setActivePolicy(pols.data.find((p) => p.active) ?? null);
    } catch {
      message.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const issue = async () => {
    const k = await apiKeysApi.create({ name: INSTANCE_KEY_NAME });
    setIssued(k);
    void load();
  };
  const rotate = async () => {
    if (!apiKey) return;
    const k = await apiKeysApi.rotate(apiKey.id);
    setIssued(k);
    void load();
  };
  const revoke = async () => {
    if (!apiKey) return;
    await apiKeysApi.revoke(apiKey.id);
    message.success('Instance API key revoked');
    void load();
  };

  return (
    <>
      <PageHeader title="Settings" description="Instance-wide configuration" />

      <Card title={<Space><KeyOutlined /> Instance API key</Space>} loading={loading} style={{ marginBottom: 16 }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Per-device keys are issued per user on each user's page. This is an optional shared instance key (e.g. bootstrap/automation)."
        />
        {issued && (
          <Alert
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
            message="Copy this token now — it is shown only once"
            description={
              <Space.Compact style={{ width: '100%' }}>
                <Input readOnly value={issued.token} style={{ fontFamily: 'monospace' }} />
                <Button icon={<CopyOutlined />} onClick={() => { void navigator.clipboard.writeText(issued.token); message.success('Copied'); }} />
              </Space.Compact>
            }
          />
        )}
        {apiKey ? (
          <Space direction="vertical">
            <Text>Prefix: <Text code>shp_{apiKey.prefix}…</Text> {apiKey.active ? <Tag color="green">active</Tag> : <Tag>inactive</Tag>}</Text>
            <Text type="secondary">Created {dayjs(apiKey.createdAt).format('YYYY-MM-DD')}{apiKey.lastUsedAt ? ` · last used ${dayjs(apiKey.lastUsedAt).format('YYYY-MM-DD HH:mm')}` : ''}</Text>
            <Space>
              <Button onClick={rotate}>Rotate &amp; reveal</Button>
              <Popconfirm title="Revoke the instance key?" onConfirm={revoke}><Button danger>Revoke</Button></Popconfirm>
            </Space>
          </Space>
        ) : (
          <Button type="primary" onClick={issue}>Issue instance API key</Button>
        )}
      </Card>

      <Card title="Policies">
        <Paragraph>
          Policies (with their CLIs, rules and webhooks) are managed in{' '}
          <Link to="/policies">Policies</Link>. Assign them to users/service accounts from each user's page.
        </Paragraph>
        <Text type="secondary">
          Global fallback policy:{' '}
          {activePolicy ? <Link to={`/policies/${activePolicy.id}`}>{activePolicy.name}</Link> : <Text type="secondary">none active</Text>}
          {' '}— used when a user has no direct or profile policy.
        </Text>
      </Card>
    </>
  );
}
