import { useEffect, useState } from 'react';
import { Button, Drawer, Form, Input, Select, Table, Tag, Space, Popconfirm, App as AntApp, Tabs, Switch } from 'antd';
import { PageHeader } from '../../components/PageHeader';
import { clisApi, type CreateCliPayload } from '../../api/endpoints/clis';
import type { CliCatalogItem } from '../../types/api';

const ENFORCEMENT_OPTS = [
  { value: 'enforce', label: 'Enforce' },
  { value: 'warn', label: 'Warn' },
  { value: 'audit', label: 'Audit' },
];

export function ClisListPage() {
  const { message } = AntApp.useApp();
  const [data, setData] = useState<CliCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CliCatalogItem | null>(null);
  const [form] = Form.useForm<CreateCliPayload>();

  const load = async () => {
    setLoading(true);
    try {
      const res = await clisApi.list({ limit: 200 });
      setData(res.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Failed to load CLIs');
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
      if (editing) {
        await clisApi.update(editing.id, values);
        message.success('CLI updated');
      } else {
        await clisApi.create(values);
        message.success('CLI created');
      }
      setOpen(false);
      setEditing(null);
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
        title="CLIs Catalog"
        description="Mapped and supported command-line tools. Consumed by the Go wrapper at install time."
        extra={
          <Button
            type="primary"
            onClick={() => {
              setEditing(null);
              form.resetFields();
              setOpen(true);
            }}
          >
            New CLI
          </Button>
        }
      />
      <Table<CliCatalogItem>
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={[
          { title: 'Slug', dataIndex: 'slug', render: (v) => <Tag color="blue">{v}</Tag> },
          { title: 'Name', dataIndex: 'name' },
          { title: 'Vendor', dataIndex: 'vendor' },
          { title: 'Env var hint', dataIndex: 'envVarHint' },
          {
            title: 'Enforcement',
            dataIndex: 'defaultEnforcement',
            render: (v) => (
              <Tag color={v === 'enforce' ? 'red' : v === 'warn' ? 'gold' : 'default'}>{v}</Tag>
            ),
          },
          {
            title: 'Active',
            dataIndex: 'active',
            render: (v) => (v ? <Tag color="green">yes</Tag> : <Tag>no</Tag>),
          },
          {
            title: 'Actions',
            render: (_, r) => (
              <Space>
                <Button
                  type="link"
                  onClick={() => {
                    setEditing(r);
                    form.setFieldsValue({
                      slug: r.slug,
                      name: r.name,
                      vendor: r.vendor,
                      description: r.description,
                      envVarHint: r.envVarHint,
                      defaultEnforcement: r.defaultEnforcement,
                      installCommands: r.installCommands,
                      docsUrl: r.docsUrl,
                      icon: r.icon,
                      active: r.active,
                    });
                    setOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Popconfirm
                  title="Delete CLI?"
                  onConfirm={async () => {
                    await clisApi.remove(r.id);
                    message.success('CLI deleted');
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

      <Drawer
        width={640}
        open={open}
        title={editing ? `Edit ${editing.slug}` : 'New CLI'}
        onClose={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        extra={
          <Button type="primary" onClick={onSubmit}>
            {editing ? 'Save' : 'Create'}
          </Button>
        }
        destroyOnClose
      >
        <Form layout="vertical" form={form}>
          <Form.Item label="Slug" name="slug" rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9_-]*$/ }]}>
            <Input placeholder="gh" disabled={!!editing} />
          </Form.Item>
          <Form.Item label="Name" name="name" rules={[{ required: true }]}>
            <Input placeholder="GitHub CLI" />
          </Form.Item>
          <Form.Item label="Vendor" name="vendor">
            <Input placeholder="GitHub Inc." />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="Env var hint" name="envVarHint">
            <Input placeholder="GH_TOKEN" />
          </Form.Item>
          <Form.Item label="Default enforcement" name="defaultEnforcement" initialValue="warn">
            <Select options={ENFORCEMENT_OPTS} />
          </Form.Item>
          <Form.Item label="Docs URL" name="docsUrl">
            <Input />
          </Form.Item>
          <Form.Item label="Icon" name="icon">
            <Input placeholder="github" />
          </Form.Item>
          <Form.Item label="Active" name="active" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
          <Tabs
            items={[
              {
                key: 'mac',
                label: 'macOS',
                children: (
                  <Form.Item name={['installCommands', 'mac']}>
                    <Input.TextArea rows={3} placeholder="brew install gh" />
                  </Form.Item>
                ),
              },
              {
                key: 'linux',
                label: 'Linux',
                children: (
                  <Form.Item name={['installCommands', 'linux']}>
                    <Input.TextArea rows={3} placeholder="curl -fsSL ... | sudo apt-key add -" />
                  </Form.Item>
                ),
              },
              {
                key: 'windows',
                label: 'Windows',
                children: (
                  <Form.Item name={['installCommands', 'windows']}>
                    <Input.TextArea rows={3} placeholder="winget install GitHub.cli" />
                  </Form.Item>
                ),
              },
            ]}
          />
        </Form>
      </Drawer>
    </>
  );
}
