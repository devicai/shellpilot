import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { PageHeader } from '../../components/PageHeader';
import { credentialsApi } from '../../api/endpoints/credentials';
import { clisApi } from '../../api/endpoints/clis';
import { usersApi } from '../../api/endpoints/users';
import { CliLogo } from '../clis/ClisList';
import type {
  CliAuthMode,
  CliCatalogItem,
  CredentialEntry,
  User,
} from '../../types/api';

const { Text } = Typography;

interface FormShape {
  userId?: string;
  cli: string;
  secret?: string;
  values?: Record<string, string>;
  content?: string;
}

const MODE_LABEL: Record<CliAuthMode, string> = {
  env: 'Env var',
  'env-multi': 'Env vars',
  file: 'File',
  flag: 'Flag',
  'login-command': 'Login command',
  none: 'None',
};

export function CredentialsListPage() {
  const { message } = AntApp.useApp();
  const [data, setData] = useState<CredentialEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<FormShape>();

  const [clis, setClis] = useState<CliCatalogItem[]>([]);
  const [usersById, setUsersById] = useState<Record<string, User>>({});

  const selectedCliSlug = Form.useWatch('cli', form);
  const selectedCli = useMemo(
    () => clis.find((c) => c.slug === selectedCliSlug),
    [clis, selectedCliSlug],
  );
  const mode: CliAuthMode = selectedCli?.auth?.mode ?? 'env';
  const acceptsStored = mode !== 'login-command' && mode !== 'none';

  const load = async () => {
    setLoading(true);
    try {
      const res = await credentialsApi.list({ limit: 200 });
      setData(res.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Failed to load credentials');
    } finally {
      setLoading(false);
    }
  };

  const loadCaches = async () => {
    try {
      const [clisRes, usersRes] = await Promise.all([
        clisApi.list({ limit: 500 }),
        usersApi.list({ limit: 500 }),
      ]);
      setClis(clisRes.data);
      setUsersById(Object.fromEntries(usersRes.data.map((u) => [u.id, u])));
    } catch {
      // non-fatal
    }
  };

  useEffect(() => {
    load();
    loadCaches();
  }, []);

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: { secret?: string; values?: Record<string, string>; content?: string } = {};
      switch (mode) {
        case 'env':
        case 'flag':
          payload.secret = values.secret;
          break;
        case 'env-multi':
          payload.values = values.values;
          break;
        case 'file':
          payload.content = values.content;
          break;
        default:
          break;
      }
      await credentialsApi.store({
        userId: values.userId || undefined,
        cli: values.cli,
        payload,
      });
      message.success('Credential stored (encrypted at rest with AES-256-GCM)');
      setOpen(false);
      form.resetFields();
      load();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Operation failed');
    }
  };

  const cliBySlug = useMemo(
    () => Object.fromEntries(clis.map((c) => [c.slug, c])),
    [clis],
  );

  return (
    <>
      <PageHeader
        title="Credentials Vault"
        description="Encrypted at rest. Plain secrets are never returned by the API — only resolved as JIT tokens (~60s) for the Go wrapper."
        extra={
          <Button type="primary" onClick={() => setOpen(true)}>
            Store credential
          </Button>
        }
      />
      <Table<CredentialEntry>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={data}
        columns={[
          {
            title: 'User',
            dataIndex: 'userId',
            render: (v: string) => (
              <Text style={{ fontSize: 12 }}>{usersById[v]?.email ?? v}</Text>
            ),
          },
          {
            title: 'CLI',
            dataIndex: 'cli',
            render: (v: string) => (
              <Space size={6}>
                <CliLogo iconUrl={cliBySlug[v]?.iconUrl} size={18} />
                <Text className="shellpilot-mono" style={{ fontSize: 12 }}>
                  {v}
                </Text>
              </Space>
            ),
          },
          {
            title: 'Mode',
            dataIndex: 'mode',
            width: 130,
            render: (v: CliAuthMode) => <Tag>{MODE_LABEL[v] ?? v}</Tag>,
          },
          {
            title: 'Target',
            render: (_, r) => {
              if (r.mode === 'env') return <Text className="shellpilot-mono">{r.envVar}</Text>;
              if (r.mode === 'env-multi')
                return (
                  <Text className="shellpilot-mono" style={{ fontSize: 11 }}>
                    {(r.envVars ?? []).join(', ')}
                  </Text>
                );
              if (r.mode === 'file')
                return <Text className="shellpilot-mono">{r.filePath}</Text>;
              if (r.mode === 'flag') return <Text className="shellpilot-mono">{r.flag}</Text>;
              return <Text type="secondary">—</Text>;
            },
          },
          { title: 'Updated', dataIndex: 'updatedAt', width: 180 },
          {
            title: '',
            width: 100,
            render: (_, r) => (
              <Popconfirm
                title="Delete credential?"
                onConfirm={async () => {
                  await credentialsApi.remove(r.id);
                  message.success('Credential deleted');
                  load();
                }}
              >
                <Button type="link" size="small" danger>
                  Delete
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />

      <Modal
        open={open}
        title="Store credential"
        onCancel={() => {
          setOpen(false);
          form.resetFields();
        }}
        onOk={onSubmit}
        okText="Store"
        okButtonProps={{ disabled: !acceptsStored }}
        destroyOnClose
      >
        <Form layout="vertical" form={form}>
          <Form.Item label="User id (optional; defaults to current user)" name="userId">
            <Input placeholder="64f0ab..." />
          </Form.Item>

          <Form.Item label="CLI" name="cli" rules={[{ required: true }]}>
            <Select
              showSearch
              placeholder="Select a CLI"
              optionFilterProp="label"
              options={clis.map((c) => ({
                value: c.slug,
                label: `${c.name} (${c.slug}) — ${MODE_LABEL[c.auth?.mode ?? 'env']}`,
              }))}
            />
          </Form.Item>

          {!selectedCli ? (
            <Alert
              type="info"
              showIcon
              message="Pick a CLI to see the credential shape it expects."
            />
          ) : !acceptsStored ? (
            <Alert
              type="warning"
              showIcon
              message={`${selectedCli.name} uses mode "${mode}"`}
              description={
                mode === 'login-command'
                  ? `This CLI authenticates interactively. Run "${selectedCli.auth?.loginCommand ?? '<login command>'}" on the workstation — ShellPilot does not store a credential for it.`
                  : 'This CLI manages its own credentials. ShellPilot does not store anything for it.'
              }
            />
          ) : mode === 'env' ? (
            <Form.Item
              label={`Secret (will be injected as ${selectedCli.auth?.envVar ?? '<env var>'})`}
              name="secret"
              rules={[{ required: true }]}
              extra="Stored encrypted with AES-256-GCM. Never returned again."
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          ) : mode === 'flag' ? (
            <Form.Item
              label={`Secret (appended as ${selectedCli.auth?.flag ?? '<flag>'}=value)`}
              name="secret"
              rules={[{ required: true }]}
              extra="Stored encrypted with AES-256-GCM. Never returned again."
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          ) : mode === 'file' ? (
            <Form.Item
              label={`File content (written to ${selectedCli.auth?.filePath ?? '<path>'})`}
              name="content"
              rules={[{ required: true }]}
              extra="Stored encrypted with AES-256-GCM. Never returned again."
            >
              <Input.TextArea rows={10} placeholder={selectedCli.auth?.fileFormat === 'json' ? '{ "type": "service_account", ... }' : ''} />
            </Form.Item>
          ) : mode === 'env-multi' ? (
            <>
              <Alert
                type="info"
                showIcon
                message="One value per declared env var. All injected together at exec time."
                style={{ marginBottom: 12 }}
              />
              {(selectedCli.auth?.envVars ?? []).map((envName) => (
                <Form.Item
                  key={envName}
                  label={envName}
                  name={['values', envName]}
                  rules={[{ required: true }]}
                >
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
              ))}
            </>
          ) : null}
        </Form>
      </Modal>
    </>
  );
}
