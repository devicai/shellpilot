import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert, App, Button, Card, Form, Input, InputNumber, Modal, Popconfirm,
  Segmented, Select, Space, Switch, Table, Tag, Typography,
} from 'antd';
import { CopyOutlined, DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { usersApi } from '../../api/endpoints/users';
import { profilesApi } from '../../api/endpoints/profiles';
import { rulesApi } from '../../api/endpoints/rules';
import { clisApi } from '../../api/endpoints/clis';
import { apiKeysApi } from '../../api/endpoints/apiKeys';
import { credentialsApi } from '../../api/endpoints/credentials';
import { authApi } from '../../api/endpoints/auth';
import { DecisionTag } from '../../components/PolicyTags';
import type {
  ApiKeyMeta, CliAuthMode, CliCatalogItem, CredentialEntry, Decision, Policy, Profile, Rule, User,
} from '../../types/api';

const { Title, Text, Paragraph } = Typography;
const DECISIONS: Decision[] = ['allow', 'deny', 'requires-approval'];

type AccessMode = 'profile' | 'policy' | 'individual';

function computeEffectiveId(u: User, profs: Profile[], pols: Policy[]): string | null {
  if (u.policyId) return u.policyId;
  if (u.profileId) {
    const pr = profs.find((p) => p.id === u.profileId);
    if (pr?.policyId) return pr.policyId;
  }
  return pols.find((p) => p.active)?.id ?? null;
}

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
  const [policies, setPolicies] = useState<Policy[]>([]); // global (shared) only
  const [clis, setClis] = useState<CliCatalogItem[]>([]);
  const [keys, setKeys] = useState<ApiKeyMeta[]>([]);
  const [creds, setCreds] = useState<CredentialEntry[]>([]);
  const [effPolicy, setEffPolicy] = useState<Policy | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [idForm] = Form.useForm();
  const [ruleForm] = Form.useForm();
  const [credForm] = Form.useForm();
  const [accessMode, setAccessMode] = useState<AccessMode>('profile');
  const [ruleModal, setRuleModal] = useState<{ open: boolean; editing?: Rule }>({ open: false });
  const [credOpen, setCredOpen] = useState(false);

  const host = window.location.host;
  const apiBase = `${window.location.origin}/api/v1`;

  const load = async () => {
    const [u, pf, pol, cl, ks, cr] = await Promise.all([
      usersApi.get(id),
      profilesApi.list({ limit: 200 }),
      rulesApi.listPolicies({ limit: 200 }),
      clisApi.list({ limit: 500 }),
      apiKeysApi.list({ limit: 200 }),
      credentialsApi.list({ limit: 500 }),
    ]);
    setUser(u);
    setProfiles(pf.data);
    setPolicies(pol.data);
    setClis(cl.data);
    setKeys(ks.data.filter((k) => k.userId === id));
    setCreds(cr.data.filter((c) => c.userId === id));
    idForm.setFieldsValue({ name: u.name, role: u.role, type: u.type, active: u.active });

    // Resolve the effective policy by id (works for individual/owner policies
    // that the global list omits); a dangling reference 404s → treated as none.
    const eid = computeEffectiveId(u, pf.data, pol.data);
    let ep: Policy | null = null;
    let rs: Rule[] = [];
    if (eid) {
      try {
        ep = await rulesApi.getPolicy(eid);
        rs = await rulesApi.listRules(eid);
      } catch {
        ep = null;
        rs = [];
      }
    }
    setEffPolicy(ep);
    setRules(rs);
    const individual = !!ep && String(ep.ownerUserId ?? '') === u.id;
    setAccessMode(individual ? 'individual' : u.policyId ? 'policy' : 'profile');
  };
  useEffect(() => {
    void load();
  }, [id]);

  const isIndividual = useMemo(
    () => !!effPolicy && !!user && String(effPolicy.ownerUserId ?? '') === user.id,
    [effPolicy, user],
  );
  const editable = isIndividual;

  // Value for the "Direct policy" select: only show it if the assigned policy
  // is a global one (owner policies live under the Individual rules tab).
  const directGlobalValue = useMemo(
    () => policies.find((p) => p.id === user?.policyId)?.id,
    [policies, user],
  );

  const effLabel = useMemo(() => {
    if (!user) return '';
    if (isIndividual) return 'Individual rules';
    if (!effPolicy) return user.policyId ? 'unassigned (referenced policy no longer exists)' : 'no governing policy';
    if (user.policyId) return `direct → ${effPolicy.name}`;
    if (user.profileId) return `profile → ${effPolicy.name}`;
    return `global fallback → ${effPolicy.name}`;
  }, [user, isIndividual, effPolicy]);

  // credential modal is mode-aware — these hooks must run on every render,
  // so they live above the `if (!user)` guard (React rules of hooks).
  const credCliSlug = Form.useWatch('cli', credForm);
  const credCli = useMemo(() => clis.find((c) => c.slug === credCliSlug), [clis, credCliSlug]);
  const credMode: CliAuthMode = credCli?.auth?.mode ?? 'env';
  const credStorable = credMode !== 'login-command' && credMode !== 'none';
  const credCliOptions = useMemo(() => {
    const governed = effPolicy?.clis ?? [];
    return governed.length ? clis.filter((c) => governed.includes(c.slug)) : clis;
  }, [clis, effPolicy]);

  if (!user) return null;

  const saveIdentity = async () => {
    const v = await idForm.validateFields();
    await usersApi.update(id, v);
    message.success('Saved');
    void load();
  };

  const setProfile = async (profileId?: string) => {
    await usersApi.update(id, { profileId: profileId || '', policyId: '' });
    void load();
  };
  const setPolicy = async (policyId?: string) => {
    await usersApi.update(id, { policyId: policyId || '', profileId: '' });
    void load();
  };

  // Give the user their own owner-scoped policy ("individual rules"), copying
  // whatever currently governs them so editing here never mutates a shared one.
  const createIndividualRules = async () => {
    const created = await rulesApi.createPolicy({
      name: `Individual rules — ${user.email}`,
      description: `Private CLIs & rules for ${user.email}`,
      defaultEffect: effPolicy?.defaultEffect ?? 'deny',
      enforcement: effPolicy?.enforcement ?? 'warn',
      clis: effPolicy?.clis ?? [],
      ownerUserId: user.id,
    });
    for (const r of rules) {
      await rulesApi.createRule(created.id, {
        cli: r.cli, path: r.path, effect: r.effect, reason: r.reason, priority: r.priority,
      });
    }
    await usersApi.update(id, { policyId: created.id, profileId: '' });
    message.success('Individual rules created — editable below');
    setAccessMode('individual');
    void load();
  };

  const saveClis = async (next: string[]) => {
    if (!effPolicy) return;
    await rulesApi.updatePolicy(effPolicy.id, { clis: next });
    void load();
  };

  const saveRule = async () => {
    if (!effPolicy) return;
    const v = await ruleForm.validateFields();
    if (ruleModal.editing) await rulesApi.updateRule(ruleModal.editing.id, v);
    else await rulesApi.createRule(effPolicy.id, v);
    setRuleModal({ open: false });
    void load();
  };

  const submitCred = async () => {
    const v = await credForm.validateFields();
    const payload: { secret?: string; values?: Record<string, string>; content?: string } = {};
    if (credMode === 'env' || credMode === 'flag') payload.secret = v.secret;
    else if (credMode === 'env-multi') payload.values = v.values;
    else if (credMode === 'file') payload.content = v.content;
    await credentialsApi.store({ userId: id, cli: v.cli, payload });
    message.success('Credential stored (encrypted at rest)');
    setCredOpen(false);
    credForm.resetFields();
    void load();
  };

  const newKey = () => {
    let keyName = `${user.email} device`;
    modal.confirm({
      title: 'Issue API key',
      content: <Input defaultValue={keyName} onChange={(e) => { keyName = e.target.value; }} />,
      onOk: async () => {
        const issued = await apiKeysApi.create({ name: keyName.trim(), userId: id });
        modal.success({ title: 'API key issued — copy it now', width: 560, content: <CodeBlock value={issued.token} /> });
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
          onChange={(v) => setAccessMode(v as AccessMode)}
          options={[
            { value: 'profile', label: 'Profile' },
            { value: 'policy', label: 'Direct policy' },
            { value: 'individual', label: 'Individual rules' },
          ]}
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
        ) : accessMode === 'policy' ? (
          <Form.Item label="Shared policy assigned directly" tooltip="A global policy from the Policies catalog. Edited in Policies, not here.">
            <Select
              allowClear
              style={{ width: 360 }}
              placeholder="Select a shared policy"
              value={directGlobalValue}
              onChange={(v) => setPolicy(v)}
              options={policies.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
        ) : isIndividual ? (
          <Text type="secondary">This user has their own CLIs &amp; rules — edit them in the card below.</Text>
        ) : (
          <Space direction="vertical">
            <Text type="secondary">Give this user a private set of CLIs &amp; rules, independent of any shared policy or profile.</Text>
            <Button type="primary" onClick={createIndividualRules}>Create individual rules</Button>
          </Space>
        )}
        <Alert style={{ marginTop: 16 }} type="info" showIcon message={<>Effective policy: <Text strong>{effLabel}</Text></>} />
      </Card>

      <Card
        title="CLIs & rules"
        style={{ marginBottom: 16 }}
        extra={editable && (
          <Button
            icon={<PlusOutlined />}
            onClick={() => { ruleForm.resetFields(); ruleForm.setFieldsValue({ effect: 'deny', priority: 0 }); setRuleModal({ open: true }); }}
          >
            New rule
          </Button>
        )}
      >
        {!editable && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={effPolicy ? 'These CLIs & rules are shared' : 'This user has no CLIs or rules yet'}
            description={effPolicy
              ? 'They come from the assigned profile or a shared policy, so editing here would affect everyone using it. Create individual rules for this user (the current CLIs and rules are copied) to customize them safely.'
              : 'Create individual rules to define which CLIs this user can run and the rules that govern them.'}
            action={<Button size="small" onClick={createIndividualRules}>Create individual rules</Button>}
          />
        )}

        <Form.Item label="CLIs this user can run" tooltip="The CLIs the wrapper installs/shims for this user" style={{ marginBottom: 16 }}>
          <Select
            mode="multiple"
            allowClear
            disabled={!editable}
            placeholder={editable ? 'Select CLIs' : 'Read-only'}
            value={effPolicy?.clis ?? []}
            onChange={(v: string[]) => void saveClis(v)}
            options={clis.map((c) => ({ value: c.slug, label: `${c.name} (${c.slug})` }))}
          />
        </Form.Item>

        <Table<Rule>
          rowKey="id"
          dataSource={rules}
          pagination={false}
          locale={{ emptyText: effPolicy ? 'No rules' : 'No governing policy' }}
          columns={[
            { title: 'CLI', dataIndex: 'cli', render: (c) => <Text code>{c}</Text> },
            { title: 'Path', dataIndex: 'path', render: (p) => <Text code>{p}</Text> },
            { title: 'Effect', dataIndex: 'effect', render: (e) => <DecisionTag value={e} /> },
            { title: 'Reason', dataIndex: 'reason' },
            { title: 'Priority', dataIndex: 'priority' },
            ...(editable ? [{
              title: 'Actions',
              render: (_: unknown, r: Rule) => (
                <Space>
                  <Button size="small" onClick={() => { ruleForm.setFieldsValue(r); setRuleModal({ open: true, editing: r }); }}>Edit</Button>
                  <Popconfirm title="Delete rule?" onConfirm={async () => { await rulesApi.deleteRule(r.id); void load(); }}>
                    <Button size="small" danger>Delete</Button>
                  </Popconfirm>
                </Space>
              ),
            }] : []),
          ]}
        />
      </Card>

      <Card
        title="Credentials"
        style={{ marginBottom: 16 }}
        extra={<Button icon={<PlusOutlined />} onClick={() => { credForm.resetFields(); setCredOpen(true); }}>Store credential</Button>}
      >
        <Paragraph type="secondary" style={{ marginTop: -8 }}>
          Encrypted at rest (AES-256-GCM). Resolved as short-lived JIT tokens for the wrapper; never returned in plaintext.
        </Paragraph>
        <Table<CredentialEntry>
          rowKey="id"
          dataSource={creds}
          pagination={false}
          locale={{ emptyText: 'No stored credentials for this user' }}
          columns={[
            { title: 'CLI', dataIndex: 'cli', render: (c) => <Text code>{c}</Text> },
            { title: 'Mode', dataIndex: 'mode', render: (m) => <Tag>{m}</Tag> },
            { title: 'Target', render: (_, c) => c.envVar ?? c.flag ?? c.filePath ?? (c.envVars?.join(', ')) ?? '—' },
            {
              title: 'Actions',
              render: (_, c) => (
                <Popconfirm title="Delete credential?" onConfirm={async () => { await credentialsApi.remove(c.id); message.success('Deleted'); void load(); }}>
                  <Button size="small" danger>Delete</Button>
                </Popconfirm>
              ),
            },
          ]}
        />
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

      <Card title="Connect a device">
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
            <Select options={DECISIONS.map((d) => ({ value: d, label: d }))} />
          </Form.Item>
          <Form.Item name="reason" label="Reason"><Input /></Form.Item>
          <Form.Item name="priority" label="Priority"><InputNumber min={0} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Store credential"
        open={credOpen}
        onCancel={() => { setCredOpen(false); credForm.resetFields(); }}
        onOk={submitCred}
        okText="Store"
        okButtonProps={{ disabled: !credStorable }}
        destroyOnClose
      >
        <Form form={credForm} layout="vertical">
          <Form.Item label="CLI" name="cli" rules={[{ required: true }]}>
            <Select
              showSearch
              placeholder="Select a CLI"
              optionFilterProp="label"
              options={credCliOptions.map((c) => ({ value: c.slug, label: `${c.name} (${c.slug}) — ${c.auth?.mode ?? 'env'}` }))}
            />
          </Form.Item>
          {!credCli ? (
            <Alert type="info" showIcon message="Pick a CLI to see the credential shape it expects." />
          ) : !credStorable ? (
            <Alert
              type="warning"
              showIcon
              message={`${credCli.name} uses mode "${credMode}"`}
              description={credMode === 'login-command'
                ? `This CLI authenticates interactively. Run "${credCli.auth?.loginCommand ?? '<login command>'}" on the workstation — ShellPilot stores nothing.`
                : 'This CLI manages its own credentials. ShellPilot stores nothing for it.'}
            />
          ) : credMode === 'env' || credMode === 'flag' ? (
            <Form.Item
              label={credMode === 'env'
                ? `Secret (injected as ${credCli.auth?.envVar ?? '<env var>'})`
                : `Secret (appended as ${credCli.auth?.flag ?? '<flag>'}=value)`}
              name="secret"
              rules={[{ required: true }]}
              extra="Stored encrypted with AES-256-GCM. Never returned again."
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          ) : credMode === 'file' ? (
            <Form.Item
              label={`File content (written to ${credCli.auth?.filePath ?? '<path>'})`}
              name="content"
              rules={[{ required: true }]}
              extra="Stored encrypted with AES-256-GCM. Never returned again."
            >
              <Input.TextArea rows={10} placeholder={credCli.auth?.fileFormat === 'json' ? '{ "type": "service_account", ... }' : ''} />
            </Form.Item>
          ) : credMode === 'env-multi' ? (
            <>
              <Alert type="info" showIcon message="One value per declared env var. All injected together at exec time." style={{ marginBottom: 12 }} />
              {(credCli.auth?.envVars ?? []).map((envName) => (
                <Form.Item key={envName} label={envName} name={['values', envName]} rules={[{ required: true }]}>
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
              ))}
            </>
          ) : null}
        </Form>
      </Modal>
    </div>
  );
}
