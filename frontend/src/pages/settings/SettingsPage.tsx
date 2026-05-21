import { useEffect, useState } from 'react';
import { App as AntApp, Button, Card, Popconfirm, Space, Table, Tag } from 'antd';
import { PageHeader } from '../../components/PageHeader';
import { rulesApi } from '../../api/endpoints/rules';
import type { Policy } from '../../types/api';

export function SettingsPage() {
  const { message } = AntApp.useApp();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await rulesApi.listPolicies({ limit: 100 });
      setPolicies(res.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message ?? 'Failed to load policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PageHeader title="Settings" description="Manage policies and global ShellPilot configuration" />

      <Card title="Policies" size="small">
        <Table<Policy>
          rowKey="id"
          loading={loading}
          dataSource={policies}
          columns={[
            { title: 'Name', dataIndex: 'name' },
            { title: 'Default effect', dataIndex: 'defaultEffect' },
            { title: 'Enforcement', dataIndex: 'enforcement' },
            { title: 'Version', dataIndex: 'version' },
            {
              title: 'Active',
              dataIndex: 'active',
              render: (v) => (v ? <Tag color="green">active</Tag> : null),
            },
            {
              title: 'Actions',
              render: (_, r) => (
                <Space>
                  {!r.active && (
                    <Button
                      type="link"
                      onClick={async () => {
                        await rulesApi.activatePolicy(r.id);
                        message.success(`Activated ${r.name}`);
                        load();
                      }}
                    >
                      Activate
                    </Button>
                  )}
                  <Popconfirm
                    title="Delete policy and all its rules?"
                    onConfirm={async () => {
                      await rulesApi.deletePolicy(r.id);
                      message.success('Policy deleted');
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
      </Card>
    </>
  );
}
