import { useEffect, useState } from 'react';
import { App as AntApp, Button, Form, Input, Modal, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import { PageHeader } from '../../components/PageHeader';
import { credentialsApi, type StoreCredentialPayload } from '../../api/endpoints/credentials';
import type { CredentialEntry } from '../../types/api';

const { Text } = Typography;

export function CredentialsListPage() {
  const { message } = AntApp.useApp();
  const [data, setData] = useState<CredentialEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<StoreCredentialPayload>();

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

  useEffect(() => {
    load();
  }, []);

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      await credentialsApi.store(values);
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
        loading={loading}
        dataSource={data}
        columns={[
          { title: 'User', dataIndex: 'userId', render: (v) => <Text className="shellpilot-mono">{v}</Text> },
          { title: 'CLI', dataIndex: 'cli', render: (v) => <Tag color="blue">{v}</Tag> },
          { title: 'Env var', dataIndex: 'envVar', render: (v) => <Text className="shellpilot-mono">{v}</Text> },
          { title: 'Updated at', dataIndex: 'updatedAt' },
          {
            title: 'Actions',
            render: (_, r) => (
              <Space>
                <Popconfirm
                  title="Delete credential?"
                  onConfirm={async () => {
                    await credentialsApi.remove(r.id);
                    message.success('Credential deleted');
                    load();
                  }}
                >
                  <Button type="link" danger>
                    Delete
                  </Button>
                </Popconfirm>
              </Space>
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
        destroyOnClose
      >
        <Form layout="vertical" form={form}>
          <Form.Item label="User id (optional; defaults to current user)" name="userId">
            <Input placeholder="64f0ab..." />
          </Form.Item>
          <Form.Item label="CLI" name="cli" rules={[{ required: true }]}>
            <Input placeholder="gh" />
          </Form.Item>
          <Form.Item label="Env var" name="envVar" rules={[{ required: true }]}>
            <Input placeholder="GH_TOKEN" />
          </Form.Item>
          <Form.Item
            label="Secret"
            name="secret"
            rules={[{ required: true }]}
            extra="Stored encrypted with AES-256-GCM. Never returned again."
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
