import { useEffect, useState } from 'react';
import { Button, Modal, Form, Input, Select, Table, Tag, Space, Popconfirm, App as AntApp, Switch } from 'antd';
import { PageHeader } from '../../components/PageHeader';
import { usersApi, type CreateUserPayload } from '../../api/endpoints/users';
import type { User, UserRole } from '../../types/api';

const ROLE_OPTS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'operator', label: 'Operator' },
  { value: 'viewer', label: 'Viewer' },
];

export function UsersListPage() {
  const { message } = AntApp.useApp();
  const [data, setData] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [pwdOpen, setPwdOpen] = useState<User | null>(null);
  const [form] = Form.useForm<CreateUserPayload>();
  const [pwdForm] = Form.useForm<{ newPassword: string }>();

  const load = async () => {
    setLoading(true);
    try {
      const res = await usersApi.list({ limit: 100 });
      setData(res.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Failed to load users');
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
        await usersApi.update(editing.id, {
          email: values.email,
          name: values.name,
          role: values.role,
          active: values.active,
        });
        message.success('User updated');
      } else {
        await usersApi.create(values);
        message.success('User created');
      }
      setOpen(false);
      form.resetFields();
      setEditing(null);
      await load();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Operation failed');
    }
  };

  const onChangePwd = async () => {
    if (!pwdOpen) return;
    try {
      const values = await pwdForm.validateFields();
      await usersApi.changePassword(pwdOpen.id, values.newPassword);
      message.success('Password updated');
      setPwdOpen(null);
      pwdForm.resetFields();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Operation failed');
    }
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="People with access to the ShellPilot console"
        extra={
          <Button
            type="primary"
            onClick={() => {
              setEditing(null);
              form.resetFields();
              setOpen(true);
            }}
          >
            New user
          </Button>
        }
      />
      <Table<User>
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={[
          { title: 'Email', dataIndex: 'email' },
          { title: 'Name', dataIndex: 'name' },
          {
            title: 'Role',
            dataIndex: 'role',
            render: (v: UserRole) => (
              <Tag color={v === 'admin' ? 'red' : v === 'operator' ? 'blue' : 'default'}>{v}</Tag>
            ),
          },
          {
            title: 'Active',
            dataIndex: 'active',
            render: (v) => (v ? <Tag color="green">yes</Tag> : <Tag>no</Tag>),
          },
          { title: 'Last login', dataIndex: 'lastLoginAt' },
          {
            title: 'Actions',
            render: (_, r) => (
              <Space>
                <Button
                  type="link"
                  onClick={() => {
                    setEditing(r);
                    form.setFieldsValue({
                      email: r.email,
                      name: r.name,
                      role: r.role,
                      active: r.active,
                      password: '',
                    });
                    setOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button type="link" onClick={() => setPwdOpen(r)}>
                  Reset password
                </Button>
                <Popconfirm
                  title="Delete user?"
                  onConfirm={async () => {
                    await usersApi.remove(r.id);
                    message.success('User deleted');
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
        title={editing ? 'Edit user' : 'New user'}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={onSubmit}
        okText={editing ? 'Save' : 'Create'}
        destroyOnClose
      >
        <Form layout="vertical" form={form}>
          <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Name" name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          {!editing && (
            <Form.Item label="Password" name="password" rules={[{ required: true, min: 8 }]}>
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item label="Role" name="role" initialValue="viewer">
            <Select options={ROLE_OPTS} />
          </Form.Item>
          <Form.Item label="Active" name="active" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={!!pwdOpen}
        title={`Reset password — ${pwdOpen?.email ?? ''}`}
        onCancel={() => {
          setPwdOpen(null);
          pwdForm.resetFields();
        }}
        onOk={onChangePwd}
        okText="Update"
        destroyOnClose
      >
        <Form layout="vertical" form={pwdForm}>
          <Form.Item label="New password" name="newPassword" rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
