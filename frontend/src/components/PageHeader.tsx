import { ReactNode } from 'react';
import { Typography, Space } from 'antd';

const { Title, Text } = Typography;

interface Props {
  title: ReactNode;
  description?: ReactNode;
  extra?: ReactNode;
}

export function PageHeader({ title, description, extra }: Props) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>
          {title}
        </Title>
        {description && (
          <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            {description}
          </Text>
        )}
      </div>
      {extra && <Space>{extra}</Space>}
    </div>
  );
}
