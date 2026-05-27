import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Card, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { rulesApi } from '../../api/endpoints/rules';
import { DecisionTag, EnforcementTag } from '../../components/PolicyTags';
import type { Policy } from '../../types/api';

const { Title } = Typography;

export function PoliciesListPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await rulesApi.listPolicies({ limit: 100 });
      setPolicies(res.data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    const p = await rulesApi.createPolicy({ name: `policy-${Date.now()}` });
    navigate(`/policies/${p.id}`);
  };

  const activate = async (id: string) => {
    await rulesApi.activatePolicy(id);
    message.success('Policy activated');
    void load();
  };

  const remove = async (id: string) => {
    await rulesApi.deletePolicy(id);
    message.success('Policy deleted');
    void load();
  };

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Policies</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={create}>New policy</Button>
      </Space>
      <Card>
        <Table<Policy>
          rowKey="id"
          loading={loading}
          dataSource={policies}
          pagination={false}
          onRow={(p) => ({ onClick: () => navigate(`/policies/${p.id}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Name', dataIndex: 'name' },
            { title: 'CLIs', dataIndex: 'clis', render: (clis: string[]) => (clis?.length ? clis.join(', ') : <Tag>none</Tag>) },
            { title: 'Default', dataIndex: 'defaultEffect', render: (d) => <DecisionTag value={d} /> },
            { title: 'Enforcement', dataIndex: 'enforcement', render: (e) => <EnforcementTag value={e} /> },
            { title: 'Version', dataIndex: 'version' },
            { title: 'Active', dataIndex: 'active', render: (a: boolean) => (a ? <Tag color="green">active</Tag> : null) },
            {
              title: 'Actions',
              render: (_, p) => (
                <Space onClick={(e) => e.stopPropagation()}>
                  {!p.active && <Button size="small" onClick={() => activate(p.id)}>Activate</Button>}
                  <Popconfirm title="Delete policy and its rules?" onConfirm={() => remove(p.id)}>
                    <Button size="small" danger>Delete</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
