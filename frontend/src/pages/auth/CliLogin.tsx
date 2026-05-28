import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, Alert, Result, Space } from 'antd';
import { useAuth } from '../../context/AuthContext';
import { apiKeysApi } from '../../api/endpoints/apiKeys';
import DevicLogo from '../../assets/devic-logo.png';

const { Title, Paragraph, Text } = Typography;

/**
 * Browser landing page for `shellpilot login` (case 2). The CLI opens
 * this with ?port&state pointing at its localhost callback. After the user
 * authenticates and approves, we mint a named API key and redirect the browser
 * to http://127.0.0.1:<port>/callback?key=...&state=... where the CLI captures
 * it. The key never transits our own backend beyond the standard mint call.
 */
export function CliLoginPage() {
  const [params] = useSearchParams();
  const { user, login } = useAuth();

  const port = params.get('port') ?? '';
  const state = params.get('state') ?? '';
  const portValid = /^\d{1,5}$/.test(port);

  const [keyName, setKeyName] = useState(`CLI device (${new Date().toISOString().slice(0, 10)})`);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);

  const invalid = !portValid || !state;

  const wrap = useMemo(
    () => ({ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }),
    [],
  );

  if (invalid) {
    return (
      <div style={wrap}>
        <Card style={{ maxWidth: 460 }}>
          <Result
            status="error"
            title="Invalid CLI login link"
            subTitle="This page is opened by the ShellPilot CLI. Run `shellpilot login --base-url <host>` from your terminal."
          />
        </Card>
      </div>
    );
  }

  const doLogin = async (values: { email: string; password: string }) => {
    setError(null);
    setBusy(true);
    try {
      await login(values.email, values.password);
    } catch {
      setError('Invalid email or password');
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setError(null);
    setBusy(true);
    try {
      const issued = await apiKeysApi.create({ name: keyName.trim() || 'CLI device' });
      // Hand the freshly-minted key back to the CLI's localhost callback.
      const target = `http://127.0.0.1:${port}/callback?key=${encodeURIComponent(issued.token)}&state=${encodeURIComponent(state)}`;
      setApproved(true);
      window.location.href = target;
    } catch {
      setError('Could not authorize the device. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div style={wrap}>
      <Card style={{ maxWidth: 460, width: '100%' }}>
        <Space direction="vertical" align="center" style={{ width: '100%', marginBottom: 16 }}>
          <img src={DevicLogo} alt="Devic" style={{ height: 40 }} />
          <Title level={4} style={{ margin: 0 }}>Authorize ShellPilot CLI</Title>
        </Space>

        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}

        {!user ? (
          <>
            <Paragraph type="secondary">Sign in to authorize the CLI on this device.</Paragraph>
            <Form layout="vertical" onFinish={doLogin}>
              <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
                <Input autoFocus autoComplete="username" />
              </Form.Item>
              <Form.Item name="password" label="Password" rules={[{ required: true }]}>
                <Input.Password autoComplete="current-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={busy}>Sign in</Button>
            </Form>
          </>
        ) : approved ? (
          <Result
            status="success"
            title="Device authorized ✔"
            subTitle="Return to your terminal — the CLI is now authenticated. You can close this tab."
          />
        ) : (
          <>
            <Paragraph>
              Signed in as <Text strong>{user.email}</Text>. Approve to issue an API key for the CLI on this device.
            </Paragraph>
            <Form layout="vertical">
              <Form.Item label="Device name (for the key)">
                <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} />
              </Form.Item>
            </Form>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button type="primary" loading={busy} onClick={approve}>Authorize device</Button>
            </Space>
          </>
        )}
      </Card>
    </div>
  );
}
