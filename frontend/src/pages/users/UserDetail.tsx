import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Alert, App, Button, Card, Form, Input, Modal, Popconfirm,
  Segmented, Select, Space, Switch, Table, Tag, Typography,
} from 'antd';
import { CopyOutlined, DownloadOutlined, EditOutlined, KeyOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { usersApi } from '../../api/endpoints/users';
import { profilesApi } from '../../api/endpoints/profiles';
import { rulesApi } from '../../api/endpoints/rules';
import { clisApi } from '../../api/endpoints/clis';
import { credentialsApi } from '../../api/endpoints/credentials';
import { authApi } from '../../api/endpoints/auth';
import { UserCliDrawer } from './UserCliDrawer';
import type {
  CliAuthMode, CliCatalogItem, CredentialEntry, Decision, Policy, Profile, Rule, User,
} from '../../types/api';

const { Title, Text, Paragraph } = Typography;

type AccessMode = 'profile' | 'policy' | 'individual';
type OsKey = 'mac' | 'linux' | 'win' | 'download';

const OS_OPTIONS: { value: OsKey; label: string }[] = [
  { value: 'mac', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
  { value: 'win', label: 'Windows' },
  { value: 'download', label: 'Direct download' },
];

const OS_INSTALL: Record<OsKey, string> = {
  mac: 'brew install devicai/tap/devic-cli-wrapper',
  linux: 'curl -fsSL https://github.com/devicai/homebrew-tap/releases/latest/download/devic-cli-wrapper-linux-amd64 -o /usr/local/bin/devic-cli-wrapper && chmod +x /usr/local/bin/devic-cli-wrapper',
  win: 'Invoke-WebRequest -Uri https://github.com/devicai/homebrew-tap/releases/latest/download/devic-cli-wrapper-windows-amd64.exe -OutFile devic-cli-wrapper.exe',
  download: 'https://github.com/devicai/homebrew-tap/releases/latest',
};

const CRED_LABEL: Record<CliAuthMode, string> = {
  env: 'Env var', 'env-multi': 'Env vars', flag: 'API key', file: 'File', 'login-command': 'Login', none: 'None',
};

const EFFECT_COLOR: Record<Decision, string> = { allow: 'green', deny: 'red', 'requires-approval': 'gold' };

const RULE_CHIP_LIMIT = 3;

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
  const { message } = App.useApp();

  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]); // global (shared) only
  const [clis, setClis] = useState<CliCatalogItem[]>([]);
  const [creds, setCreds] = useState<CredentialEntry[]>([]);
  const [effPolicy, setEffPolicy] = useState<Policy | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [idForm] = Form.useForm();
  const [pwdForm] = Form.useForm();
  const [accessMode, setAccessMode] = useState<AccessMode>('individual');
  const [os, setOs] = useState<OsKey>('mac');
  const [pwdOpen, setPwdOpen] = useState(false);
  const [addCliOpen, setAddCliOpen] = useState(false);
  const [addCliSlug, setAddCliSlug] = useState<string | undefined>();
  const [drawerSlug, setDrawerSlug] = useState<string | null>(null);

  const host = window.location.host;
  const apiBase = `${window.location.origin}/api/v1`;

  const load = async () => {
    const [u, pf, pol, cl, cr] = await Promise.all([
      usersApi.get(id),
      profilesApi.list({ limit: 200 }),
      rulesApi.listPolicies({ limit: 200 }),
      clisApi.list({ limit: 500 }),
      credentialsApi.list({ limit: 500 }),
    ]);
    setUser(u);
    setProfiles(pf.data);
    setPolicies(pol.data);
    setClis(cl.data);
    setCreds(cr.data.filter((c) => c.userId === id));
    idForm.setFieldsValue({ name: u.name, role: u.role, type: u.type, active: u.active });

    const eid = computeEffectiveId(u, pf.data, pol.data);
    let ep: Policy | null = null;
    let rs: Rule[] = [];
    if (eid) {
      try { ep = await rulesApi.getPolicy(eid); rs = await rulesApi.listRules(eid); }
      catch { ep = null; rs = []; }
    }
    setEffPolicy(ep);
    setRules(rs);
    const individual = !!ep && String(ep.ownerUserId ?? '') === u.id;
    setAccessMode(individual ? 'individual' : u.profileId ? 'profile' : u.policyId ? 'policy' : 'individual');
  };
  useEffect(() => { void load(); }, [id]);

  const isIndividual = useMemo(
    () => !!effPolicy && !!user && String(effPolicy.ownerUserId ?? '') === user.id,
    [effPolicy, user],
  );
  const editable = isIndividual;

  // Maps for the table
  const cliBySlug = useMemo(() => new Map(clis.map((c) => [c.slug, c])), [clis]);
  const rulesByCli = useMemo(() => {
    const m = new Map<string, Rule[]>();
    for (const r of rules) {
      const arr = m.get(r.cli) ?? [];
      arr.push(r);
      m.set(r.cli, arr);
    }
    return m;
  }, [rules]);
  const credByCli = useMemo(() => new Map(creds.map((c) => [c.cli, c])), [creds]);

  // Direct-policy Select value: only the assigned policy if it's actually in
  // the global (shared) list — owner policies live under Individual rules.
  const directGlobalValue = useMemo(
    () => policies.find((p) => p.id === user?.policyId)?.id,
    [policies, user],
  );

  if (!user) return null;

  const profile = user.profileId ? profiles.find((p) => p.id === user.profileId) : null;

  const saveIdentity = async () => {
    const v = await idForm.validateFields();
    await usersApi.update(id, v);
    message.success('Saved');
    void load();
  };

  const changePassword = async () => {
    const v = await pwdForm.validateFields();
    await usersApi.changePassword(id, v.newPassword);
    message.success('Password updated');
    pwdForm.resetFields();
    setPwdOpen(false);
  };

  const setProfileFor = async (profileId?: string) => {
    await usersApi.update(id, { profileId: profileId || '', policyId: '' });
    void load();
  };
  const setPolicyFor = async (policyId?: string) => {
    await usersApi.update(id, { policyId: policyId || '', profileId: '' });
    void load();
  };

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
      await rulesApi.createRule(created.id, { cli: r.cli, path: r.path, effect: r.effect, reason: r.reason, priority: r.priority });
    }
    await usersApi.update(id, { policyId: created.id, profileId: '' });
    message.success('Individual rules created — editable now');
    setAccessMode('individual');
    void load();
  };

  const addCli = async () => {
    if (!effPolicy || !addCliSlug) return;
    const next = Array.from(new Set([...(effPolicy.clis ?? []), addCliSlug]));
    await rulesApi.updatePolicy(effPolicy.id, { clis: next });
    setAddCliOpen(false);
    const slug = addCliSlug;
    setAddCliSlug(undefined);
    await load();
    // Open the drawer for the newly added CLI to start configuring rules/cred.
    setDrawerSlug(slug);
  };

  // Revoke a CLI from the user: remove from policy.clis, drop its rules, and
  // delete the user's stored credential for it. Bounded by what's loaded.
  const revokeCli = async (slug: string) => {
    if (!effPolicy) return;
    await rulesApi.updatePolicy(effPolicy.id, {
      clis: (effPolicy.clis ?? []).filter((s) => s !== slug),
    });
    for (const r of rules.filter((r) => r.cli === slug)) {
      await rulesApi.deleteRule(r.id);
    }
    const cred = credByCli.get(slug);
    if (cred) await credentialsApi.remove(cred.id);
    message.success('CLI revoked from this user');
    void load();
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

  const tableData = (effPolicy?.clis ?? []).map((slug) => ({
    slug,
    cli: cliBySlug.get(slug),
    rules: rulesByCli.get(slug) ?? [],
    cred: credByCli.get(slug) ?? null,
  }));

  const drawerCli = drawerSlug ? cliBySlug.get(drawerSlug) ?? null : null;
  const drawerRules = drawerSlug ? (rulesByCli.get(drawerSlug) ?? []) : [];
  const drawerCred = drawerSlug ? credByCli.get(drawerSlug) ?? null : null;

  // Available catalog CLIs not already in the user's policy.
  const addableClis = clis.filter((c) => !(effPolicy?.clis ?? []).includes(c.slug));

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          {user.name} <Tag color={user.type === 'service' ? 'purple' : 'blue'}>{user.type}</Tag>
        </Title>
        <Button onClick={() => navigate('/users')}>Back</Button>
      </Space>

      {/* ===== User details ===== */}
      <Card
        title="User details"
        style={{ marginBottom: 16 }}
        extra={(
          <Space>
            <Button onClick={() => { pwdForm.resetFields(); setPwdOpen(true); }}>Change password</Button>
            <Button type="primary" onClick={saveIdentity}>Save</Button>
          </Space>
        )}
      >
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

      {/* ===== Connect a device ===== */}
      <Card title="Connect a device" style={{ marginBottom: 16 }}>
        <Space size="middle" style={{ marginBottom: 8 }} wrap>
          <Text type="secondary">Authenticate the CLI on a machine. Install:</Text>
          <Segmented value={os} onChange={(v) => setOs(v as OsKey)} options={OS_OPTIONS} size="small" />
        </Space>
        {os === 'download' ? (
          <Space>
            <Button icon={<DownloadOutlined />} href={OS_INSTALL.download} target="_blank">
              Open GitHub releases
            </Button>
            <Text type="secondary">Pick the binary for your platform from the latest release.</Text>
          </Space>
        ) : (
          <CodeBlock value={OS_INSTALL[os]} />
        )}

        <div style={{ height: 16 }} />
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

      {/* ===== Access + CLIs table ===== */}
      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} align="start" wrap>
          <Segmented
            value={accessMode}
            onChange={(v) => setAccessMode(v as AccessMode)}
            options={[
              { value: 'profile', label: 'Profile' },
              { value: 'policy', label: 'Direct policy' },
              { value: 'individual', label: 'Individual rules' },
            ]}
          />
          {editable && effPolicy && (
            <Button icon={<PlusOutlined />} onClick={() => { setAddCliSlug(undefined); setAddCliOpen(true); }} disabled={addableClis.length === 0}>
              Add new CLI
            </Button>
          )}
        </Space>

        {/* Mode-specific top: pickers for profile/policy, banner with reference, or CTA */}
        {accessMode === 'profile' && (
          <>
            <Form.Item label="Profile (reusable bundle of CLIs + policy)" style={{ marginBottom: 12 }}>
              <Select
                allowClear
                style={{ maxWidth: 360 }}
                placeholder="Select a profile"
                value={user.profileId}
                onChange={(v) => setProfileFor(v)}
                options={profiles.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Form.Item>
            {profile && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message={<>Profile: <Link to={`/profiles/${profile.id}`}><Text strong>{profile.name}</Text></Link> · CLIs and rules below are read-only; edit them in the profile.</>}
              />
            )}
          </>
        )}
        {accessMode === 'policy' && (
          <>
            <Form.Item label="Shared policy assigned directly" style={{ marginBottom: 12 }} tooltip="A global policy from the Policies catalog. Edited there, not here.">
              <Select
                allowClear
                style={{ width: 360 }}
                placeholder="Select a shared policy"
                value={directGlobalValue}
                onChange={(v) => setPolicyFor(v)}
                options={policies.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Form.Item>
            {effPolicy && !isIndividual && user.policyId && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message={<>Direct policy: <Link to={`/policies/${effPolicy.id}`}><Text strong>{effPolicy.name}</Text></Link> · CLIs and rules below are read-only; edit them in the policy.</>}
              />
            )}
          </>
        )}
        {accessMode === 'individual' && !isIndividual && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="This user has no individual rules yet"
            description="Create individual rules to define which CLIs they can run and the rules that govern them. The current effective CLIs and rules (if any) are copied as a starting point."
            action={<Button size="small" onClick={createIndividualRules}>Create individual rules</Button>}
          />
        )}

        {/* The unified CLIs table */}
        <Table
          rowKey="slug"
          dataSource={tableData}
          pagination={false}
          locale={{ emptyText: effPolicy ? 'No CLIs in this policy yet' : 'No governing policy' }}
          onRow={(row) => (editable ? { onClick: () => setDrawerSlug(row.slug), style: { cursor: 'pointer' } } : {})}
          columns={[
            {
              title: 'CLI',
              dataIndex: 'slug',
              render: (slug: string, row) => (
                <Space>
                  <Text strong>{row.cli?.name ?? slug}</Text>
                  {editable && <EditOutlined style={{ opacity: 0.6 }} />}
                </Space>
              ),
            },
            {
              title: 'Rules',
              key: 'rules',
              render: (_, row) => {
                if (!row.rules.length) return <Text type="secondary">no rules</Text>;
                const shown = row.rules.slice(0, RULE_CHIP_LIMIT);
                const more = row.rules.length - shown.length;
                return (
                  <Space size={4} wrap>
                    {shown.map((r) => (
                      <Tag key={r.id} color={EFFECT_COLOR[r.effect]} style={{ margin: 0 }}>
                        <Text code style={{ fontSize: 11 }}>{r.path}</Text>
                      </Tag>
                    ))}
                    {more > 0 && <Text type="secondary">(+ {more} more)</Text>}
                  </Space>
                );
              },
            },
            {
              title: 'Credentials',
              key: 'cred',
              width: 200,
              render: (_, row) => {
                const mode = row.cred?.mode ?? row.cli?.auth?.mode;
                if (row.cred) {
                  return (
                    <Space size={6}>
                      <KeyOutlined style={{ color: '#1677ff' }} />
                      <Text>{CRED_LABEL[row.cred.mode]}</Text>
                    </Space>
                  );
                }
                if (mode === 'login-command' || mode === 'none') {
                  return <Text type="secondary">— ({mode})</Text>;
                }
                return (
                  <Space size={6}>
                    <KeyOutlined style={{ color: '#aaa' }} />
                    <Text type="secondary">No credential</Text>
                  </Space>
                );
              },
            },
            ...(editable ? [{
              title: 'Actions',
              key: 'actions',
              width: 120,
              render: (_: unknown, row: typeof tableData[number]) => (
                <Space onClick={(e) => e.stopPropagation()}>
                  <Popconfirm
                    title={`Revoke ${row.cli?.name ?? row.slug}?`}
                    description="Removes the CLI plus its rules and stored credential for this user."
                    onConfirm={() => revokeCli(row.slug)}
                  >
                    <Button size="small" danger icon={<MinusCircleOutlined />}>Revoke</Button>
                  </Popconfirm>
                </Space>
              ),
            }] : []),
          ]}
        />
      </Card>

      {/* ===== Drawer (per-CLI editor) ===== */}
      <UserCliDrawer
        open={!!drawerSlug && editable}
        onClose={() => setDrawerSlug(null)}
        userId={id}
        cli={drawerCli}
        policyId={effPolicy?.id ?? null}
        rules={drawerRules}
        credential={drawerCred}
        onChange={load}
      />

      {/* ===== Add new CLI modal ===== */}
      <Modal
        title="Add a CLI to this user"
        open={addCliOpen}
        onCancel={() => { setAddCliOpen(false); setAddCliSlug(undefined); }}
        onOk={addCli}
        okButtonProps={{ disabled: !addCliSlug }}
        destroyOnClose
      >
        <Select
          showSearch
          style={{ width: '100%' }}
          placeholder="Pick a CLI from the catalog"
          optionFilterProp="label"
          value={addCliSlug}
          onChange={setAddCliSlug}
          options={addableClis.map((c) => ({ value: c.slug, label: `${c.name} (${c.slug})` }))}
        />
        <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          You'll add rules and a credential for it next.
        </Paragraph>
      </Modal>

      {/* ===== Change password modal ===== */}
      <Modal
        title={`Change password — ${user.email}`}
        open={pwdOpen}
        onCancel={() => { setPwdOpen(false); pwdForm.resetFields(); }}
        onOk={changePassword}
        okText="Update"
        destroyOnClose
      >
        <Form form={pwdForm} layout="vertical">
          <Form.Item label="New password" name="newPassword" rules={[{ required: true, min: 8 }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
