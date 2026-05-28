import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Alert, App, Button, Divider, Form, Input, Modal, Popconfirm,
  Segmented, Select, Space, Switch, Table, Tag, Typography,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, CopyOutlined, DownloadOutlined,
  EditOutlined, ExclamationCircleOutlined, KeyOutlined, MinusCircleOutlined, PlusOutlined,
} from '@ant-design/icons';
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
type OsKey = 'mac' | 'linux' | 'download';

const OS_OPTIONS: { value: OsKey; label: string }[] = [
  { value: 'mac', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
  { value: 'download', label: 'Direct download' },
];

// Bump CLI_VERSION when a new wrapper release is published. The release assets
// are versioned tarballs (no `latest/download/<stable-name>` shortcut), so the
// curl URL has to know the version. Brew handles its own.
const CLI_VERSION = '0.5.0';

const OS_INSTALL: Record<OsKey, string> = {
  mac: 'brew install devicai/tap/devic-cli-wrapper',
  linux: `curl -fsSL https://github.com/devicai/homebrew-tap/releases/download/v${CLI_VERSION}/devic-cli-wrapper_${CLI_VERSION}_linux_amd64.tar.gz | sudo tar -xz -C /usr/local/bin devic-cli-wrapper`,
  download: 'https://github.com/devicai/homebrew-tap/releases/latest',
};

const CRED_LABEL: Record<CliAuthMode, string> = {
  env: 'Env var', 'env-multi': 'Env vars', flag: 'API key', file: 'File', 'login-command': 'Login', none: 'None',
};

const EFFECT_COLOR: Record<Decision, string> = { allow: 'green', deny: 'red', 'requires-approval': 'gold' };
const EFFECT_ICON: Record<Decision, ReactNode> = {
  allow: <CheckCircleOutlined />,
  deny: <CloseCircleOutlined />,
  'requires-approval': <ExclamationCircleOutlined />,
};

const RULE_CHIP_LIMIT = 3;
// Inline monospace path inside a rule chip — no extra border/background, so we
// don't get the doubled-border look from wrapping <Text code> in a <Tag>.
const PATH_FONT: CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 };

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

function SectionLabel({ children }: { children: ReactNode }) {
  return <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>{children}</Text>;
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

  // Rows for the CLIs table: UNION of policy.clis and the distinct CLIs found
  // in the rules — otherwise a rule whose CLI isn't listed in clis (legacy
  // policies, shared policies without an explicit catalog set) would load but
  // render nowhere. Wildcard rules (cli='*') get a leading 'All CLIs (*)'
  // pseudo-row (view-only; edit wildcards in the Policy detail).
  // Declared above the `if (!user)` guard so hook order is stable.
  const tableData = useMemo(() => {
    const slugs = new Set<string>(effPolicy?.clis ?? []);
    const wild: Rule[] = [];
    for (const r of rules) {
      if (r.cli === '*') wild.push(r);
      else if (r.cli) slugs.add(r.cli);
    }
    const rows = Array.from(slugs).map((slug) => ({
      slug,
      cli: cliBySlug.get(slug),
      rules: rulesByCli.get(slug) ?? [],
      cred: credByCli.get(slug) ?? null,
      wildcard: false,
    }));
    if (wild.length) {
      rows.unshift({ slug: '*', cli: undefined, rules: wild, cred: null, wildcard: true });
    }
    return rows;
  }, [effPolicy, rules, cliBySlug, rulesByCli, credByCli]);

  if (!user) return null;

  const profile = user.profileId ? profiles.find((p) => p.id === user.profileId) : null;

  const saveIdentity = async () => {
    const v = await idForm.validateFields();
    await usersApi.update(id, v);
    message.success('Saved');
    await load();
  };

  const changePassword = async () => {
    const v = await pwdForm.validateFields();
    await usersApi.changePassword(id, v.newPassword);
    message.success('Password updated');
    pwdForm.resetFields();
    setPwdOpen(false);
  };

  // Direct-manipulation saves: each picker change writes and reloads. We await
  // load() so the UI is always rendered against fresh server state, surface
  // errors via toast (no more silent failures), and only toast success once
  // the write actually landed.
  const reportError = (e: unknown, fallback: string) => {
    const err = e as { response?: { data?: { message?: string | string[] } } };
    const m = err.response?.data?.message;
    message.error(Array.isArray(m) ? m.join('; ') : (m ?? fallback));
  };
  const setProfileFor = async (profileId?: string) => {
    try {
      await usersApi.update(id, { profileId: profileId || '', policyId: '' });
      message.success(profileId ? 'Profile assigned' : 'Profile cleared');
      await load();
    } catch (e) {
      reportError(e, 'Failed to assign profile');
    }
  };
  const setPolicyFor = async (policyId?: string) => {
    try {
      await usersApi.update(id, { policyId: policyId || '', profileId: '' });
      message.success(policyId ? 'Direct policy assigned' : 'Direct policy cleared');
      await load();
    } catch (e) {
      reportError(e, 'Failed to assign policy');
    }
  };

  // Individual rules are sticky: if the user already has an owner-scoped
  // policy from a previous switch (kept around when they jumped to a shared
  // policy or profile), reactivate it instead of creating a new one — no
  // duplicate / orphan policies, and the user's own rules survive.
  const createIndividualRules = async () => {
    try {
      const existing = await rulesApi.listPolicies({ ownerUserId: user.id, limit: 1 });
      if (existing.data.length > 0) {
        const own = existing.data[0];
        await usersApi.update(id, { policyId: own.id, profileId: '' });
        message.success('Individual rules reactivated');
        setAccessMode('individual');
        await load();
        return;
      }
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
      await load();
    } catch (e) {
      reportError(e, 'Failed to create individual rules');
    }
  };

  const addCli = async () => {
    if (!effPolicy || !addCliSlug) return;
    const next = Array.from(new Set([...(effPolicy.clis ?? []), addCliSlug]));
    await rulesApi.updatePolicy(effPolicy.id, { clis: next });
    setAddCliOpen(false);
    const slug = addCliSlug;
    setAddCliSlug(undefined);
    message.success('CLI added');
    await load();
    setDrawerSlug(slug);
  };

  // Revoke a CLI from the user: remove from policy.clis, drop its rules, and
  // delete the user's stored credential for it.
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
    await load();
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

  // Computed inline below — see the useMemo declared above the early-return
  // guard so the hook order is stable across renders (React rules of hooks).

  const drawerCli = drawerSlug ? cliBySlug.get(drawerSlug) ?? null : null;
  const drawerRules = drawerSlug ? (rulesByCli.get(drawerSlug) ?? []) : [];
  const drawerCred = drawerSlug ? credByCli.get(drawerSlug) ?? null : null;

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
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
        <Title level={4} style={{ margin: 0 }}>User details</Title>
        <Space>
          <Button onClick={() => { pwdForm.resetFields(); setPwdOpen(true); }}>Change password</Button>
          <Button type="primary" onClick={saveIdentity}>Save</Button>
        </Space>
      </Space>
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
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

      <Divider />

      {/* ===== Connect a device ===== */}
      <Title level={4} style={{ margin: 0, marginBottom: 12 }}>Connect a device</Title>
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
          <SectionLabel>Admin provisions this service account (replace the admin key):</SectionLabel>
          <CodeBlock value={`devic-cli-wrapper auth provision --base-url ${host} --api-key <ADMIN_KEY> --service-account ${user.email}`} />
        </>
      ) : (
        <>
          <SectionLabel>User browser login:</SectionLabel>
          <CodeBlock value={`devic-cli-wrapper login --base-url ${host}`} />
        </>
      )}

      <Paragraph style={{ marginTop: 16, marginBottom: 8 }}>Or provision this user's machine with an enrollment file:</Paragraph>
      <Space>
        <Button icon={<DownloadOutlined />} onClick={downloadEnrollment}>Download enrollment file</Button>
        <Text type="secondary">then: <Text code>devic-cli-wrapper auth --file shellpilot_credentials.json --api-key &lt;ADMIN_KEY&gt;</Text></Text>
      </Space>

      <Divider />

      {/* ===== Access + CLIs ===== */}
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
          <Button
            icon={<PlusOutlined />}
            onClick={() => { setAddCliSlug(undefined); setAddCliOpen(true); }}
            disabled={addableClis.length === 0}
          >
            Add new CLI
          </Button>
        )}
      </Space>

      {/* Mode-specific top: pickers + reference banner, or CTA */}
      {accessMode === 'profile' && (
        <>
          <SectionLabel>Profile (reusable bundle of CLIs + policy)</SectionLabel>
          <Select
            allowClear
            style={{ width: 360, marginBottom: 12 }}
            placeholder="Select a profile"
            value={user.profileId}
            onChange={(v) => void setProfileFor(v)}
            options={profiles.map((p) => ({ value: p.id, label: p.name }))}
          />
          {profile && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={(
                <>
                  Profile:{' '}<Link to={`/profiles/${profile.id}`}><Text strong>{profile.name}</Text></Link>
                  {' '}· CLIs and rules below are read-only; edit them in the{' '}
                  <Link to={`/profiles/${profile.id}`}>profile details →</Link>
                </>
              )}
            />
          )}
        </>
      )}
      {accessMode === 'policy' && (
        <>
          <SectionLabel>Shared policy assigned directly</SectionLabel>
          <Select
            allowClear
            style={{ width: 360, marginBottom: 12 }}
            placeholder="Select a shared policy"
            value={directGlobalValue}
            onChange={(v) => void setPolicyFor(v)}
            options={policies.map((p) => ({ value: p.id, label: p.name }))}
          />
          {effPolicy && !isIndividual && user.policyId && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={(
                <>
                  Direct policy:{' '}<Link to={`/policies/${effPolicy.id}`}><Text strong>{effPolicy.name}</Text></Link>
                  {' '}· CLIs and rules below are read-only; edit them in the{' '}
                  <Link to={`/policies/${effPolicy.id}`}>policy details →</Link>
                </>
              )}
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

      <Table
        rowKey="slug"
        dataSource={tableData}
        pagination={false}
        locale={{ emptyText: effPolicy ? 'No CLIs in this policy yet' : 'No governing policy' }}
        onRow={(row) => (editable && !row.wildcard ? { onClick: () => setDrawerSlug(row.slug), style: { cursor: 'pointer' } } : {})}
        columns={[
          {
            title: 'CLI',
            dataIndex: 'slug',
            render: (slug: string, row) => (
              <Space>
                <Text strong>{row.wildcard ? 'All CLIs' : row.cli?.name ?? slug}</Text>
                {row.wildcard ? <Text type="secondary">(*)</Text> : (editable && <EditOutlined style={{ opacity: 0.5 }} />)}
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
                <Space size={[6, 6]} wrap>
                  {shown.map((r) => (
                    <Tag
                      key={r.id}
                      color={EFFECT_COLOR[r.effect]}
                      icon={EFFECT_ICON[r.effect]}
                      style={{ margin: 0 }}
                    >
                      <span style={PATH_FONT}>{r.path}</span>
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
              if (row.wildcard) return <Text type="secondary">—</Text>;
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
              row.wildcard ? null : (
                <Space onClick={(e) => e.stopPropagation()}>
                  <Popconfirm
                    title={`Revoke ${row.cli?.name ?? row.slug}?`}
                    description="Removes the CLI plus its rules and stored credential for this user."
                    onConfirm={() => revokeCli(row.slug)}
                  >
                    <Button size="small" danger icon={<MinusCircleOutlined />}>Revoke</Button>
                  </Popconfirm>
                </Space>
              )
            ),
          }] : []),
        ]}
      />

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
