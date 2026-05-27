import { useEffect, useState } from 'react';
import { Alert, Collapse, Form, Input, Select, Typography } from 'antd';
import type { FormInstance } from 'antd';
import Editor from '@monaco-editor/react';
import type { CliAuth, CliAuthMode } from '../types/api';

const { Text } = Typography;

const MODE_OPTIONS: { value: CliAuthMode; label: string; help: string }[] = [
  { value: 'env', label: 'Env var', help: 'Single environment variable injected before exec (e.g. GH_TOKEN, STRIPE_API_KEY).' },
  { value: 'env-multi', label: 'Env vars (multi)', help: 'Several env vars injected together (e.g. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY).' },
  { value: 'file', label: 'Config file', help: 'Write content to a file path before exec (e.g. ~/.kube/config, gcloud ADC JSON).' },
  { value: 'flag', label: 'CLI flag', help: 'Append a flag with the secret as value (e.g. --token=xxx).' },
  { value: 'login-command', label: 'Login command', help: 'Interactive login command; the wrapper does not store a secret (e.g. `gh auth login`).' },
  { value: 'none', label: 'None', help: 'The CLI manages its own credentials. ShellPilot does not inject anything.' },
];

const FILE_FORMAT_OPTIONS = [
  { value: 'raw', label: 'Raw' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
];

// Edits a JSON array bound to a Form field. Stores the raw text locally so a
// half-typed JSON doesn't get clobbered, and only writes back into the form
// when the parse succeeds.
function JsonArrayField({
  form,
  name,
  height = 200,
  placeholder,
}: {
  form: FormInstance;
  name: (string | number)[];
  height?: number;
  placeholder?: string;
}) {
  const current = Form.useWatch(name, form);
  const [text, setText] = useState<string>(() =>
    current && Array.isArray(current) && current.length ? JSON.stringify(current, null, 2) : '',
  );
  const [error, setError] = useState<string | null>(null);

  // Reset the editor buffer when the form is rehydrated (e.g. loading a CLI).
  useEffect(() => {
    const next = current && Array.isArray(current) && current.length ? JSON.stringify(current, null, 2) : '';
    setText(next);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(current)]);

  return (
    <div>
      <Editor
        height={height}
        defaultLanguage="json"
        theme="vs-dark"
        value={text}
        onChange={(v) => {
          const next = v ?? '';
          setText(next);
          const trimmed = next.trim();
          if (!trimmed) {
            form.setFieldValue(name, undefined);
            setError(null);
            return;
          }
          try {
            const parsed = JSON.parse(trimmed);
            if (!Array.isArray(parsed)) {
              setError('Must be a JSON array');
              return;
            }
            form.setFieldValue(name, parsed);
            setError(null);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
        options={{
          fontSize: 12,
          minimap: { enabled: false },
          lineNumbers: 'off',
          scrollBeyondLastLine: false,
        }}
      />
      {error && (
        <Alert
          type="error"
          showIcon
          message={`JSON error: ${error}`}
          style={{ marginTop: 6 }}
        />
      )}
      {!error && !text && placeholder && (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {placeholder}
        </Text>
      )}
    </div>
  );
}

export function CliAuthFields({
  form,
  parentName = ['auth'],
}: {
  form: FormInstance;
  parentName?: (string | number)[];
}) {
  const mode: CliAuthMode = Form.useWatch([...parentName, 'mode'], form) ?? 'env';
  const help = MODE_OPTIONS.find((o) => o.value === mode)?.help ?? '';

  return (
    <>
      <Form.Item
        label="Auth mode"
        name={[...parentName, 'mode']}
        initialValue="env"
        rules={[{ required: true }]}
        tooltip="How the wrapper injects the credential when the agent runs this CLI."
      >
        <Select options={MODE_OPTIONS.map(({ value, label }) => ({ value, label }))} />
      </Form.Item>

      {help && (
        <Alert
          type="info"
          showIcon
          message={<Text style={{ fontSize: 12 }}>{help}</Text>}
          style={{ marginBottom: 12 }}
        />
      )}

      {mode === 'env' && (
        <Form.Item
          label="Env var name"
          name={[...parentName, 'envVar']}
          rules={[{ required: true, message: 'Required for mode=env' }]}
        >
          <Input placeholder="GH_TOKEN" />
        </Form.Item>
      )}

      {mode === 'env-multi' && (
        <Form.Item
          label="Env var names"
          name={[...parentName, 'envVars']}
          rules={[{ required: true, message: 'At least one env var name' }]}
          tooltip="Type a name and press Enter. Order is preserved."
        >
          <Select
            mode="tags"
            tokenSeparators={[',', ' ']}
            placeholder="AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
          />
        </Form.Item>
      )}

      {mode === 'file' && (
        <>
          <Form.Item
            label="File path"
            name={[...parentName, 'filePath']}
            rules={[{ required: true, message: 'Required for mode=file' }]}
            tooltip="Absolute path or ~/-prefixed. The wrapper expands ~ to the user's home."
          >
            <Input placeholder="~/.kube/config" />
          </Form.Item>
          <Form.Item label="File format" name={[...parentName, 'fileFormat']} initialValue="raw">
            <Select options={FILE_FORMAT_OPTIONS} />
          </Form.Item>
        </>
      )}

      {mode === 'flag' && (
        <Form.Item
          label="Flag"
          name={[...parentName, 'flag']}
          rules={[{ required: true, message: 'Required for mode=flag' }]}
          tooltip='The flag name including dashes, e.g. "--token". The wrapper appends `=value`.'
        >
          <Input placeholder="--token" />
        </Form.Item>
      )}

      {mode === 'login-command' && (
        <Form.Item
          label="Login command"
          name={[...parentName, 'loginCommand']}
          rules={[{ required: true, message: 'Required for mode=login-command' }]}
          tooltip="The interactive command the operator should run before using this CLI."
        >
          <Input placeholder="gh auth login" />
        </Form.Item>
      )}

      <Collapse
        size="small"
        style={{ marginTop: 8 }}
        items={[
          {
            key: 'advanced',
            label: <Text style={{ fontSize: 12 }}>Advanced: post-process &amp; delivery</Text>,
            children: (
              <>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 8 }}
                  message={<Text style={{ fontSize: 11 }}>
                    Declarative server-side enrichment + client-side delivery. The kinds
                    available today are <code>http-form-post</code> for post-process and
                    <code> file / env / env-file / flag</code> for delivery. References:
                    <code> $vault.X</code>, <code>$response.X</code>, <code>$extras.X</code>,
                    <code> $auth.X</code>.
                  </Text>}
                />
                <Form.Item
                  label="postProcess (runs at /credentials/verify on the backend)"
                  name={[...parentName, 'postProcess']}
                  valuePropName="value"
                  shouldUpdate={false}
                  tooltip="JSON array. Leave empty for no server-side enrichment."
                >
                  <JsonArrayField
                    form={form}
                    name={[...parentName, 'postProcess']}
                    placeholder='Example: [{"kind":"http-form-post","url":"...","bodyFrom":{...},"extractTo":{...}}]'
                  />
                </Form.Item>
                <Form.Item
                  label="delivery (applied by the wrapper before exec)"
                  name={[...parentName, 'delivery']}
                  valuePropName="value"
                  shouldUpdate={false}
                  tooltip="JSON array. Leave empty to fall back to mode defaults."
                >
                  <JsonArrayField
                    form={form}
                    name={[...parentName, 'delivery']}
                    placeholder='Example: [{"kind":"file","path":"$auth.filePath","content":"$vault.content","chmod":"600"}]'
                  />
                </Form.Item>
              </>
            ),
          },
        ]}
      />
    </>
  );
}

// Re-export so callers that import the type by name keep working.
export type { CliAuth };
