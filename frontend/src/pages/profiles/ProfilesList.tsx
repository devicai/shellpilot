import { useEffect, useState } from 'react';
import {
  App as AntApp,
  Button,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { PageHeader } from '../../components/PageHeader';
import { profilesApi, type CreateProfilePayload } from '../../api/endpoints/profiles';
import { clisApi } from '../../api/endpoints/clis';
import { rulesApi } from '../../api/endpoints/rules';
import type { CliCatalogItem, Policy, Profile } from '../../types/api';

const { Text, Paragraph } = Typography;

export function ProfilesListPage() {
  const { message } = AntApp.useApp();
  const [data, setData] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const [clis, setClis] = useState<CliCatalogItem[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [form] = Form.useForm<CreateProfilePayload>();

  const load = async () => {
    setLoading(true);
    try {
      const [res, clisRes, polRes] = await Promise.all([
        profilesApi.list({ limit: 100 }),
        clisApi.list({ limit: 200 }),
        rulesApi.listPolicies({ limit: 50 }),
      ]);
      setData(res.data);
      setClis(clisRes.data);
      setPolicies(polRes.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openEditor = (p: Profile | null) => {
    setEditing(p);
    setCreating(p === null);
    form.setFieldsValue(
      p
        ? {
            name: p.name,
            description: p.description,
            clis: p.clis,
            policyId: p.policyId,
            active: p.active,
          }
        : {
            name: '',
            description: '',
            clis: [],
            policyId: undefined,
            active: true,
          },
    );
  };

  const onSave = async () => {
    try {
      const values = await form.validateFields();
      if (creating) {
        await profilesApi.create(values);
        message.success('Profile created');
      } else if (editing) {
        await profilesApi.update(editing.id, values);
        message.success('Profile updated');
      }
      setEditing(null);
      setCreating(false);
      await load();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Save failed');
    }
  };

  const onDelete = async (p: Profile) => {
    try {
      await profilesApi.remove(p.id);
      message.success('Profile deleted');
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Delete failed');
    }
  };

  const policyName = (id?: string) => (id ? policies.find((p) => p.id === id)?.name ?? id : '—');

  return (
    <>
      <PageHeader
        title="Profiles"
        description="Department-style templates that bundle allowed CLIs, a governing policy, and shared default credentials. Assign a profile to a user to scope what they can run through ShellPilot."
        extra={
          <Button type="primary" onClick={() => openEditor(null)}>
            New profile
          </Button>
        }
      />

      <Table<Profile>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={data}
        pagination={false}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          { title: 'Description', dataIndex: 'description', ellipsis: true },
          {
            title: 'CLIs',
            dataIndex: 'clis',
            render: (v: string[]) => (
              <Space size={4} wrap>
                {v.length === 0 ? <Text type="secondary">all</Text> : v.map((s) => <Tag key={s}>{s}</Tag>)}
              </Space>
            ),
          },
          {
            title: 'Policy',
            dataIndex: 'policyId',
            width: 160,
            render: (v: string) => <Text className="shellpilot-mono">{policyName(v)}</Text>,
          },
          {
            title: 'Active',
            dataIndex: 'active',
            width: 90,
            render: (v) => (v ? <Tag color="green">active</Tag> : <Tag>inactive</Tag>),
          },
          {
            title: 'Actions',
            width: 180,
            render: (_, r) => (
              <Space>
                <Button type="link" size="small" onClick={() => openEditor(r)}>
                  Edit
                </Button>
                <Popconfirm title="Delete profile?" onConfirm={() => onDelete(r)}>
                  <Button type="link" size="small" danger>
                    Delete
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Drawer
        width={560}
        open={creating || !!editing}
        title={creating ? 'New profile' : `Edit ${editing?.name}`}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        extra={
          <Button type="primary" onClick={onSave}>
            Save
          </Button>
        }
        destroyOnClose
      >
        <Paragraph type="secondary">
          A profile scopes a user's surface area. Empty CLI list = no restriction. Empty policy =
          fall back to the globally-active policy.
        </Paragraph>
        <Form layout="vertical" form={form}>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9_-]*$/ }]}
          >
            <Input placeholder="devops" disabled={!creating} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="DevOps team — infra and deploys" />
          </Form.Item>
          <Form.Item name="clis" label="Allowed CLIs">
            <Select
              mode="multiple"
              options={clis.map((c) => ({ value: c.slug, label: `${c.slug} — ${c.name}` }))}
              placeholder="Leave empty to allow every CLI in the catalog"
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item
            name="policyId"
            label="Policy"
            tooltip="Optional — the policy that governs this profile. Defaults to the globally-active policy when empty."
          >
            <Select
              options={policies.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="(use global active policy)"
              allowClear
            />
          </Form.Item>
          <Form.Item name="active" label="Active" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
