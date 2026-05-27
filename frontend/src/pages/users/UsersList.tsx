import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Modal, Form, Input, Segmented, Select, Table, Tag, Space, Popconfirm, App as AntApp, Switch, Typography } from 'antd';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/PageHeader';
import { usersApi, type CreateUserPayload } from '../../api/endpoints/users';
import { profilesApi } from '../../api/endpoints/profiles';
import type { Profile, User, UserRole } from '../../types/api';

const { Text } = Typography;

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
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [res, profRes] = await Promise.all([
        usersApi.list({ limit: 100 }),
        profilesApi.list({ limit: 100 }),
      ]);
      setData(res.data);
      setProfiles(profRes.data);
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
          type: values.type,
          profileId: values.profileId,
          active: values.active,
        });
        message.success('User updated');
      } else {
        await usersApi.create(values);
        message.success(values.type === 'service' ? 'Service account created' : 'User created');
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
        title="Users & Service Accounts"
        description="Identities (people and agents/automations) governed by ShellPilot"
        extra={
          <Space>
            <Button
              onClick={() => {
                setEditing(null);
                form.resetFields();
                form.setFieldsValue({ type: 'service', role: 'viewer' });
                setOpen(true);
              }}
            >
              New service account
            </Button>
            <Button
              type="primary"
              onClick={() => {
                setEditing(null);
                form.resetFields();
                form.setFieldsValue({ type: 'human', role: 'viewer' });
                setOpen(true);
              }}
            >
              New user
            </Button>
          </Space>
        }
      />
      <Table<User>
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={[
          { title: 'Email', dataIndex: 'email', render: (v: string, r) => <Link to={`/users/${r.id}`}>{v}</Link> },
          { title: 'Name', dataIndex: 'name' },
          {
            title: 'Type',
            dataIndex: 'type',
            render: (v: string) => <Tag color={v === 'service' ? 'purple' : 'blue'}>{v ?? 'human'}</Tag>,
          },
          {
            title: 'Role',
            dataIndex: 'role',
            render: (v: UserRole) => (
              <Tag color={v === 'admin' ? 'red' : v === 'operator' ? 'blue' : 'default'}>{v}</Tag>
            ),
          },
          {
            title: 'Profile',
            dataIndex: 'profileId',
            render: (v?: string) => {
              const p = v ? profiles.find((x) => x.id === v) : null;
              if (!p) return <Text type="secondary">—</Text>;
              return <Tag color="geekblue">{p.name}</Tag>;
            },
          },
          {
            title: 'Active',
            dataIndex: 'active',
            render: (v) => (v ? <Tag color="green">yes</Tag> : <Tag>no</Tag>),
          },
          {
            title: 'Last login',
            dataIndex: 'lastLoginAt',
            render: (v?: string) =>
              v ? (
                <Text className="shellpilot-mono" style={{ fontSize: 12 }}>
                  {dayjs(v).format('YYYY-MM-DD HH:mm')}
                </Text>
              ) : (
                <Text type="secondary">never</Text>
              ),
          },
          {
            title: 'Actions',
            render: (_, r) => (
              <Space>
                <Link to={`/users/${r.id}`}>Configure</Link>
                <Button
                  type="link"
                  onClick={() => {
                    setEditing(r);
                    form.setFieldsValue({
                      email: r.email,
                      name: r.name,
                      role: r.role,
                      type: r.type,
                      profileId: r.profileId,
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
          <Space size="large">
            <Form.Item label="Role" name="role" initialValue="viewer">
              <Select options={ROLE_OPTS} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item label="Type" name="type" initialValue="human">
              <Segmented options={[{ value: 'human', label: 'Human' }, { value: 'service', label: 'Service account' }]} />
            </Form.Item>
          </Space>
          <Form.Item
            label="Profile"
            name="profileId"
            tooltip="Scopes the user's allowed CLIs via a department template. Leave empty for no profile gating."
          >
            <Select
              allowClear
              placeholder="(no profile)"
              options={profiles.map((p) => ({ value: p.id, label: p.name }))}
            />
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
