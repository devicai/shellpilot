import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert, App, Button, Card, Form, Input, Popconfirm, Segmented, Select, Space, Switch, Table, Tag, Typography,
} from 'antd';
import { CopyOutlined, DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { usersApi } from '../../api/endpoints/users';
import { profilesApi } from '../../api/endpoints/profiles';
import { rulesApi } from '../../api/endpoints/rules';
import { apiKeysApi } from '../../api/endpoints/apiKeys';
import { credentialsApi } from '../../api/endpoints/credentials';
import { authApi } from '../../api/endpoints/auth';
import type { ApiKeyMeta, CredentialEntry, Policy, Profile, User } from '../../types/api';

const { Title, Text, Paragraph } = Typography;

function CodeBlock({ value }: { value: string }) {
  const { message } = App.useApp();
  return (
    <Space.Compact style={{ width: '100%' }}>
      <Input readOnly value={value} style={{ fontFamily: 'monospace' }} />
      <Button icon={<CopyOutlined />} onClick={() => { void navigator.clipboard.writeText(value); message.success('Copied'); }} />
    </Space.Compact>
  );
}

export function UserDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();

  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [keys, setKeys] = useState<ApiKeyMeta[]>([]);
  const [creds, setCreds] = useState<CredentialEntry[]>([]);
  const [idForm] = Form.useForm();
  const [accessMode, setAccessMode] = useState<'profile' | 'policy'>('profile');

  const host = window.location.host;
  const apiBase = `${window.location.origin}/api/v1`;

  const load = async () => {
    const [u, pf, pol, ks, cr] = await Promise.all([
      usersApi.get(id),
      profilesApi.list({ limit: 200 }),
      rulesApi.listPolicies({ limit: 200 }),
      apiKeysApi.list({ limit: 200 }),
      credentialsApi.list({ limit: 200 }),
    ]);
    setUser(u);
    setProfiles(pf.data);
    setPolicies(pol.data);
    setKeys(ks.data.filter((k) => k.userId === id));
    setCreds(cr.data.filter((c) => c.userId === id));
    setAccessMode(u.policyId ? 'policy' : 'profile');
    idForm.setFieldsValue({ name: u.name, role: u.role, type: u.type, active: u.active });
  };
  useEffect(() => {
    void load();
  }, [id]);

  const activePolicy = useMemo(() => policies.find((p) => p.active), [policies]);
  const effective = useMemo(() => {
    if (!user) return '';
    if (user.policyId) return `direct → ${policies.find((p) => p.id === user.policyId)?.name ?? user.policyId}`;
    if (user.profileId) {
      const prof = profiles.find((p) => p.id === user.profileId);
      const pol = prof?.policyId ? policies.find((p) => p.id === prof.policyId)?.name : null;
      return pol ? `profile "${prof?.name}" → ${pol}` : `profile "${prof?.name}" → global fallback`;
    }
    return `global fallback → ${activePolicy?.name ?? 'none'}`;
  }, [user, profiles, policies, activePolicy]);

  if (!user) return null;

  const saveIdentity = async () => {
    const v = await idForm.validateFields();
    await usersApi.update(id, v);
    message.success('Saved');
    void load();
  };

  const setProfile = async (profileId: string) => {
    await usersApi.update(id, { profileId: profileId || '', policyId: '' });
    void load();
  };
  const setPolicy = async (policyId: string) => {
    await usersApi.update(id, { policyId: policyId || '', profileId: '' });
    void load();
  };
  const createPolicyForUser = async () => {
    const p = await rulesApi.createPolicy({ name: `user-${user.email}`, defaultEffect: 'deny', enforcement: 'warn' });
    await usersApi.update(id, { policyId: p.id, profileId: '' });
    message.success('Policy created and assigned');
    navigate(`/policies/${p.id}`);
  };

  const newKey = () => {
    let keyName = `${user.email} device`;
    modal.confirm({
      title: 'Issue API key',
      content: <Input defaultValue={keyName} onChange={(e) => { keyName = e.target.value; }} />,
      onOk: async () => {
        const issued = await apiKeysApi.create({ name: keyName.trim(), userId: id });
        modal.success({
          title: 'API key issued — copy it now',
          width: 560,
          content: <CodeBlock value={issued.token} />,
        });
        void load();
      },
    });
  };

  const downloadEnrollment = async () => {
    const t = await authApi.generateEnrollment(id);
    const file = { base_url: apiBase, user_email: t.userEmail, enroll_token: t.enrollToken, expires_at: t.expiresAt };
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'shellpilot_credentials.json';
    a.click();
    URL.revokeObjectURL(a.href);
    message.success('Enrollment file downloaded (single-use, expires in 24h)');
  };

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          {user.name} <Tag color={user.type === 'service' ? 'purple' : 'blue'}>{user.type}</Tag>
        </Title>
        <Button onClick={() => navigate('/users')}>Back</Button>
      </Space>

      <Card title="Identity" style={{ marginBottom: 16 }} extra={<Button type="primary" onClick={saveIdentity}>Save</Button>}>
        <Paragraph type="secondary" style={{ marginTop: -8 }}>
          <Text strong>{user.email}</Text> · id <Text code copyable>{user.id}</Text>
        </Paragraph>
        <Form form={idForm} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Space size="large">
            <Form.Item name="role" label="Role">
              <Select style={{ width: 160 }} options={['admin', 'operator', 'viewer'].map((r) => ({ value: r, label: r }))} />
            </Form.Item>
            <Form.Item name="type" label="Type">
              <Segmented options={[{ value: 'human', label: 'Human' }, { value: 'service', label: 'Service account' }]} />
            </Form.Item>
            <Form.Item name="active" label="Active" valuePropName="checked"><Switch /></Form.Item>
          </Space>
        </Form>
      </Card>

      <Card title="Access" style={{ marginBottom: 16 }}>
        <Segmented
          value={accessMode}
          onChange={(v) => setAccessMode(v as 'profile' | 'policy')}
          options={[{ value: 'profile', label: 'Profile' }, { value: 'policy', label: 'Direct policy' }]}
          style={{ marginBottom: 16 }}
        />
        {accessMode === 'profile' ? (
          <Form.Item label="Profile (reusable bundle of CLIs + policy)">
            <Select
              allowClear
              style={{ maxWidth: 360 }}
              placeholder="Select a profile"
              value={user.profileId}
              onChange={(v) => setProfile(v)}
              options={profiles.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
        ) : (
          <Space align="end">
            <Form.Item label="Policy assigned directly" style={{ marginBottom: 0 }}>
              <Select
                allowClear
                style={{ width: 360 }}
                placeholder="Select a policy"
                value={user.policyId}
                onChange={(v) => setPolicy(v)}
                options={policies.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Form.Item>
            <Button onClick={createPolicyForUser}>Create policy for this user</Button>
          </Space>
        )}
        <Alert style={{ marginTop: 16 }} type="info" showIcon message={<>Effective policy: <Text strong>{effective}</Text></>} />
      </Card>

      <Card
        title="API keys"
        style={{ marginBottom: 16 }}
        extra={<Button icon={<PlusOutlined />} onClick={newKey}>Issue key</Button>}
      >
        <Table<ApiKeyMeta>
          rowKey="id"
          dataSource={keys}
          pagination={false}
          locale={{ emptyText: 'No keys for this user' }}
          columns={[
            { title: 'Name', dataIndex: 'name' },
            { title: 'Prefix', dataIndex: 'prefix', render: (p) => <Text code>shp_{p}…</Text> },
            { title: 'Last used', dataIndex: 'lastUsedAt', render: (d) => (d ? new Date(d).toLocaleString() : '—') },
            {
              title: '',
              render: (_, k) => (
                <Popconfirm title="Revoke key?" onConfirm={async () => { await apiKeysApi.revoke(k.id); void load(); }}>
                  <Button size="small" danger>Revoke</Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </Card>

      <Card title="Connect a device" style={{ marginBottom: 16 }}>
        <Paragraph type="secondary">Authenticate the CLI on a machine. Install: <Text code>brew install devic-cli-wrapper</Text></Paragraph>
        {user.type === 'service' ? (
          <>
            <Text>Admin provisions this service account (replace the admin key):</Text>
            <CodeBlock value={`devic-cli-wrapper auth provision --base-url ${host} --api-key <ADMIN_KEY> --service-account ${user.email}`} />
          </>
        ) : (
          <>
            <Text>User browser login:</Text>
            <CodeBlock value={`devic-cli-wrapper login --base-url ${host}`} />
          </>
        )}
        <Paragraph style={{ marginTop: 16, marginBottom: 8 }}>Or provision this user's machine with an enrollment file:</Paragraph>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={downloadEnrollment}>Download enrollment file</Button>
          <Text type="secondary">then: <Text code>devic-cli-wrapper auth --file shellpilot_credentials.json --api-key &lt;ADMIN_KEY&gt;</Text></Text>
        </Space>
      </Card>

      <Card title="Credentials" extra={<Button size="small" onClick={() => navigate('/credentials')}>Manage in vault</Button>}>
        <Table<CredentialEntry>
          rowKey="id"
          dataSource={creds}
          pagination={false}
          locale={{ emptyText: 'No stored credentials for this user' }}
          columns={[
            { title: 'CLI', dataIndex: 'cli', render: (c) => <Text code>{c}</Text> },
            { title: 'Mode', dataIndex: 'mode', render: (m) => <Tag>{m}</Tag> },
            { title: 'Target', render: (_, c) => c.envVar ?? c.flag ?? c.filePath ?? (c.envVars?.join(', ')) ?? '—' },
          ]}
        />
      </Card>
    </div>
  );
}
