import { useEffect, useMemo, useState } from 'react';
import {
  Alert, App, Button, Card, Drawer, Form, Input, InputNumber, Modal, Popconfirm,
  Space, Table, Tag, Typography,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { rulesApi } from '../../api/endpoints/rules';
import { credentialsApi } from '../../api/endpoints/credentials';
import { DecisionTag } from '../../components/PolicyTags';
import { DefaultEffectControl } from '../../components/DefaultEffectControl';
import type { CliAuthMode, CliCatalogItem, CredentialEntry, Rule } from '../../types/api';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  cli: CliCatalogItem | null;          // the catalog entry whose drawer is open
  policyId: string | null;             // user's individual policy id
  rules: Rule[];                       // already filtered to cli.slug for this policy
  credential: CredentialEntry | null;  // user's stored credential for this CLI (if any)
  onChange: () => Promise<void> | void; // ask parent to refetch everything
}

/**
 * Per-CLI editor for a user's individual rules. Two stacked sections:
 *   1. Rules (CRUD) — rules with cli=slug under the user's owner-scoped policy.
 *   2. Credential — a single credential for (user, cli), shape driven by the
 *      CLI's auth.mode (env / flag / file / env-multi). Read-only "current"
 *      summary with a Replace button when one exists.
 */
export function UserCliDrawer({ open, onClose, userId, cli, policyId, rules, credential, onChange }: Props) {
  const { message } = App.useApp();
  const [ruleForm] = Form.useForm();
  const [credForm] = Form.useForm();
  const [ruleModal, setRuleModal] = useState<{ open: boolean; editing?: Rule }>({ open: false });
  const [credEditing, setCredEditing] = useState(false);

  // Reset edit mode + form when switching CLI or when a new credential lands.
  useEffect(() => {
    setCredEditing(false);
    credForm.resetFields();
  }, [cli?.slug, credential?.id, credForm]);

  const mode: CliAuthMode = cli?.auth?.mode ?? 'env';
  const storable = mode !== 'login-command' && mode !== 'none';

  const credSummary = useMemo(() => {
    if (!credential) return null;
    if (credential.mode === 'env') return `env var ${credential.envVar ?? '?'}`;
    if (credential.mode === 'env-multi') return `env vars ${(credential.envVars ?? []).join(', ')}`;
    if (credential.mode === 'flag') return `flag ${credential.flag ?? '?'}`;
    if (credential.mode === 'file') return `file ${credential.filePath ?? '?'}`;
    return credential.mode;
  }, [credential]);

  const saveRule = async () => {
    if (!policyId || !cli) return;
    const v = await ruleForm.validateFields();
    // CLI is fixed by the drawer; the form doesn't expose it.
    const dto = { ...v, cli: cli.slug };
    if (ruleModal.editing) await rulesApi.updateRule(ruleModal.editing.id, dto);
    else await rulesApi.createRule(policyId, dto);
    setRuleModal({ open: false });
    await onChange();
  };

  const submitCred = async () => {
    if (!cli) return;
    const v = await credForm.validateFields();
    const payload: { secret?: string; values?: Record<string, string>; content?: string } = {};
    if (mode === 'env' || mode === 'flag') payload.secret = v.secret;
    else if (mode === 'env-multi') payload.values = v.values;
    else if (mode === 'file') payload.content = v.content;
    await credentialsApi.store({ userId, cli: cli.slug, payload });
    message.success('Credential stored (encrypted at rest)');
    setCredEditing(false);
    credForm.resetFields();
    await onChange();
  };

  const removeCred = async () => {
    if (!credential) return;
    await credentialsApi.remove(credential.id);
    message.success('Credential deleted');
    await onChange();
  };

  return (
    <Drawer
      title={cli ? <Space><Text>{cli.name}</Text><Text code style={{ fontSize: 12 }}>{cli.slug}</Text></Space> : 'CLI'}
      width={640}
      open={open}
      onClose={onClose}
      destroyOnClose
    >
      <Card
        size="small"
        title="Rules"
        style={{ marginBottom: 16 }}
        extra={(
          <Button
            size="small"
            icon={<PlusOutlined />}
            disabled={!policyId || !cli}
            onClick={() => { ruleForm.resetFields(); ruleForm.setFieldsValue({ effect: 'deny', priority: 0 }); setRuleModal({ open: true }); }}
          >
            New rule
          </Button>
        )}
      >
        <Table<Rule>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={rules}
          locale={{ emptyText: 'No rules for this CLI yet' }}
          columns={[
            { title: 'Path', dataIndex: 'path', render: (p) => <Text code>{p}</Text> },
            { title: 'Effect', dataIndex: 'effect', width: 120, render: (e) => <DecisionTag value={e} /> },
            { title: 'Reason', dataIndex: 'reason' },
            { title: 'Prio', dataIndex: 'priority', width: 60 },
            {
              title: '',
              width: 120,
              render: (_, r) => (
                <Space size={4}>
                  <Button size="small" onClick={() => { ruleForm.setFieldsValue(r); setRuleModal({ open: true, editing: r }); }}>Edit</Button>
                  <Popconfirm title="Delete rule?" onConfirm={async () => { await rulesApi.deleteRule(r.id); await onChange(); }}>
                    <Button size="small" danger>Delete</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Card size="small" title="Credential">
        {!storable ? (
          <Alert
            type="warning"
            showIcon
            message={cli ? `${cli.name} uses mode "${mode}"` : ''}
            description={mode === 'login-command'
              ? `This CLI authenticates interactively. Run "${cli?.auth?.loginCommand ?? '<login command>'}" on the workstation — ShellPilot stores nothing.`
              : 'This CLI manages its own credentials. ShellPilot stores nothing for it.'}
          />
        ) : credential && !credEditing ? (
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Space size={8}>
              <Tag color="blue">{credential.mode}</Tag>
              <Text type="secondary">{credSummary}</Text>
            </Space>
            <Space>
              <Button size="small" onClick={() => { credForm.resetFields(); setCredEditing(true); }}>Replace</Button>
              <Popconfirm title="Delete credential?" onConfirm={removeCred}>
                <Button size="small" danger>Delete</Button>
              </Popconfirm>
            </Space>
          </Space>
        ) : (
          <Form form={credForm} layout="vertical">
            {mode === 'env' || mode === 'flag' ? (
              <Form.Item
                label={mode === 'env'
                  ? `Secret (injected as ${cli?.auth?.envVar ?? '<env var>'})`
                  : `Secret (appended as ${cli?.auth?.flag ?? '<flag>'}=value)`}
                name="secret"
                rules={[{ required: true }]}
                extra="Stored encrypted with AES-256-GCM. Never returned again."
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            ) : mode === 'file' ? (
              <Form.Item
                label={`File content (written to ${cli?.auth?.filePath ?? '<path>'})`}
                name="content"
                rules={[{ required: true }]}
                extra="Stored encrypted with AES-256-GCM. Never returned again."
              >
                <Input.TextArea rows={10} placeholder={cli?.auth?.fileFormat === 'json' ? '{ "type": "service_account", ... }' : ''} />
              </Form.Item>
            ) : mode === 'env-multi' ? (
              <>
                <Alert type="info" showIcon message="One value per declared env var. All injected together at exec time." style={{ marginBottom: 12 }} />
                {(cli?.auth?.envVars ?? []).map((envName) => (
                  <Form.Item key={envName} label={envName} name={['values', envName]} rules={[{ required: true }]}>
                    <Input.Password autoComplete="new-password" />
                  </Form.Item>
                ))}
              </>
            ) : null}
            <Space>
              <Button type="primary" onClick={submitCred}>Store</Button>
              {credential && <Button onClick={() => setCredEditing(false)}>Cancel</Button>}
            </Space>
          </Form>
        )}
      </Card>

      <Modal
        title={ruleModal.editing ? 'Edit rule' : 'New rule'}
        open={ruleModal.open}
        onCancel={() => setRuleModal({ open: false })}
        onOk={saveRule}
        destroyOnClose
      >
        <Form form={ruleForm} layout="vertical">
          <Form.Item label="CLI">
            <Input value={cli?.slug ?? ''} disabled />
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

    </Drawer>
  );
}
