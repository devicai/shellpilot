import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Typography, Alert, Divider } from 'antd';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DevicLogo from '../assets/devic-logo.png';

const { Title, Text } = Typography;

export function LoginPage() {
  const { user, login, loading, publicConfig } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to local-only until public-config loads, so standalone behaviour is unchanged.
  const providers = publicConfig?.auth.providers ?? ['local'];
  const externalLoginUrl = publicConfig?.auth.externalLoginUrl ?? null;
  const localEnabled = providers.includes('local');
  const externalEnabled = providers.includes('external-jwt');

  // External-only deployments: bounce straight to the identity provider.
  useEffect(() => {
    if (!loading && !user && externalEnabled && !localEnabled && externalLoginUrl) {
      window.location.href = externalLoginUrl;
    }
  }, [loading, user, externalEnabled, localEnabled, externalLoginUrl]);

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const onFinish = async (values: { email: string; password: string }) => {
    setError(null);
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      navigate('/dashboard', { replace: true });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setError(err.response?.data?.message ?? err.message ?? 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        width: '100vw',
        backgroundColor: '#141414',
      }}
    >
      <Card
        style={{
          width: 380,
          backgroundColor: '#1f1f1f',
          border: '1px solid #424242',
          borderRadius: 8,
        }}
        styles={{ body: { padding: 28 } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <img src={DevicLogo} alt="Devic" style={{ height: 32, marginBottom: 16 }} />
          <Title level={4} style={{ margin: 0, color: '#d9d9d9' }}>
            ShellPilot
          </Title>
          <Text style={{ color: '#8c8c8c', fontSize: 12 }}>Sign in to the admin console</Text>
        </div>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}
        {localEnabled && (
          <Form layout="vertical" onFinish={onFinish}>
            <Form.Item
              label="Email"
              name="email"
              rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
            >
              <Input autoComplete="username" />
            </Form.Item>
            <Form.Item
              label="Password"
              name="password"
              rules={[{ required: true, message: 'Password required' }]}
            >
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting} block>
              Sign in
            </Button>
          </Form>
        )}
        {externalEnabled && externalLoginUrl && (
          <>
            {localEnabled && <Divider plain style={{ color: '#8c8c8c', fontSize: 12 }}>or</Divider>}
            <Button block onClick={() => (window.location.href = externalLoginUrl)}>
              Sign in with single sign-on
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
