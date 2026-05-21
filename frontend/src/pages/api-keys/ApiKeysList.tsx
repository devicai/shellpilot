import { useEffect, useState } from 'react';
import { Button, Modal, Form, Input, Table, Tag, Space, Popconfirm, App as AntApp, Typography, Alert } from 'antd';
import { PageHeader } from '../../components/PageHeader';
import { apiKeysApi, type CreateApiKeyPayload } from '../../api/endpoints/apiKeys';
import type { ApiKeyMeta, IssuedApiKey } from '../../types/api';
import { CopyOutlined } from '@ant-design/icons';

const { Text } = Typography;

export function ApiKeysListPage() {
  const { message } = AntApp.useApp();
  const [data, setData] = useState<ApiKeyMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<IssuedApiKey | null>(null);
  const [form] = Form.useForm<CreateApiKeyPayload>();

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiKeysApi.list({ limit: 100 });
      setData(res.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async () => {
    try {
      const values = await form.validateFields();
      const k = await apiKeysApi.create({
        ...values,
        scopes: values.scopes?.toString().split(/[\s,]+/).filter(Boolean) as unknown as string[] | undefined,
      });
      setIssued(k);
      setOpen(false);
      form.resetFields();
      load();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Operation failed');
    }
  };

  const onRotate = async (id: string) => {
    try {
      const k = await apiKeysApi.rotate(id);
      setIssued(k);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Rotate failed');
    }
  };

  return (
    <>
      <PageHeader
        title="API Keys"
        description="Tokens used by the Go wrapper to authenticate against ShellPilot"
        extra={
          <Button type="primary" onClick={() => setOpen(true)}>
            New key
          </Button>
        }
      />
      <Table<ApiKeyMeta>
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          {
            title: 'Prefix',
            dataIndex: 'prefix',
            render: (v) => <Text className="shellpilot-mono">shp_{v}…</Text>,
          },
          { title: 'User', dataIndex: 'userId', render: (v) => <Text className="shellpilot-mono">{v}</Text> },
          {
            title: 'Scopes',
            dataIndex: 'scopes',
            render: (v: string[]) =>
              v?.length ? v.map((s) => <Tag key={s}>{s}</Tag>) : <Text type="secondary">none</Text>,
          },
          { title: 'Last used', dataIndex: 'lastUsedAt' },
          { title: 'Expires', dataIndex: 'expiresAt' },
          {
            title: 'Active',
            dataIndex: 'active',
            render: (v) => (v ? <Tag color="green">yes</Tag> : <Tag>no</Tag>),
          },
          {
            title: 'Actions',
            render: (_, r) => (
              <Space>
                <Popconfirm title="Rotate secret? The previous token stops working." onConfirm={() => onRotate(r.id)}>
                  <Button type="link">Rotate</Button>
                </Popconfirm>
                <Popconfirm
                  title="Revoke key?"
                  onConfirm={async () => {
                    await apiKeysApi.revoke(r.id);
                    message.success('Key revoked');
                    load();
                  }}
                >
                  <Button type="link" danger>
                    Revoke
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        open={open}
        title="New API key"
        onCancel={() => {
          setOpen(false);
          form.resetFields();
        }}
        onOk={onCreate}
        okText="Create"
        destroyOnClose
      >
        <Form layout="vertical" form={form}>
          <Form.Item label="Name" name="name" rules={[{ required: true }]}>
            <Input placeholder="wrapper-laptop-pablo" />
          </Form.Item>
          <Form.Item label="Scopes (comma or space-separated)" name="scopes">
            <Input placeholder="rules:read credentials:issue traces:write" />
          </Form.Item>
          <Form.Item label="Expires at (ISO 8601)" name="expiresAt">
            <Input placeholder="2027-01-01T00:00:00Z" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={!!issued}
        title="Copy and store your token securely"
        onCancel={() => setIssued(null)}
        onOk={() => setIssued(null)}
        okText="I've stored it"
        cancelButtonProps={{ style: { display: 'none' } }}
        destroyOnClose
      >
        <Alert
          showIcon
          type="warning"
          message="This token will not be shown again. Copy it now."
          style={{ marginBottom: 16 }}
        />
        <Input.TextArea
          readOnly
          value={issued?.token ?? ''}
          rows={3}
          className="shellpilot-mono"
        />
        <Button
          style={{ marginTop: 8 }}
          icon={<CopyOutlined />}
          onClick={async () => {
            if (issued?.token) {
              await navigator.clipboard.writeText(issued.token);
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
