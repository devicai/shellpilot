// jwks-rsa pulls in jose (ESM-only), which Jest's CommonJS transform can't load.
// validate() never verifies a signature (it's called directly here), so stub the
// key provider to a no-op — we only exercise the claim-mapping/scope/upsert logic.
jest.mock('jwks-rsa', () => ({
  passportJwtSecret: () => (_req: unknown, _token: unknown, done: (e: unknown, k: string) => void) =>
    done(null, 'test-key'),
}));

import { UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ExternalJwtStrategy } from './external-jwt.strategy';
import { ExtensionProperty, ShellpilotModuleConfig } from '../../../config/config.types';

const CLIENT_UID: ExtensionProperty = {
  name: 'clientUID',
  type: 'string',
  required: true,
  index: true,
  entities: '*',
  source: 'header',
  headerName: 'x-client-uid',
};

function makeConfig(claimMapping = { externalUserId: 'sub', clientUID: 'client_uid' }): ShellpilotModuleConfig {
  return {
    auth: {
      providers: {
        local: { enabled: false },
        externalJwt: {
          enabled: true,
          jwksUri: 'https://id.example.com/.well-known/jwks.json',
          issuer: 'https://id.example.com',
          audience: 'shellpilot',
          claimMapping,
        },
      },
    },
  } as unknown as ShellpilotModuleConfig;
}

function makeUsers(user: Record<string, unknown> = {}) {
  const resolved = {
    _id: new Types.ObjectId(),
    email: 'alice@acme.com',
    role: 'viewer',
    name: 'Alice',
    active: true,
    ...user,
  };
  return {
    ssoUpsert: jest.fn(async () => resolved),
  };
}

function newStrategy(
  users: ReturnType<typeof makeUsers>,
  extensions: ExtensionProperty[],
  claimMapping?: { externalUserId: string; clientUID: string },
) {
  return new ExternalJwtStrategy(makeConfig(claimMapping), extensions, users as never);
}

describe('ExternalJwtStrategy.validate', () => {
  it('maps the configured claims, pins the tenant from the token, and JIT-provisions the user', async () => {
    const users = makeUsers();
    const strategy = newStrategy(users, [CLIENT_UID]);

    const result = await strategy.validate({
      sub: 'ext-1',
      client_uid: 'acme',
      email: 'alice@acme.com',
      name: 'Alice',
    });

    expect(users.ssoUpsert).toHaveBeenCalledWith(
      { externalUserId: 'ext-1', email: 'alice@acme.com', name: 'Alice' },
      { clientUID: 'acme' },
    );
    expect(result).toMatchObject({
      email: 'alice@acme.com',
      role: 'viewer',
      name: 'Alice',
      scope: { clientUID: 'acme' },
    });
    expect(result.id).toEqual(expect.any(String));
  });

  it('falls back to preferred_username when name is absent', async () => {
    const users = makeUsers();
    const strategy = newStrategy(users, [CLIENT_UID]);
    await strategy.validate({ sub: 'ext-1', client_uid: 'acme', preferred_username: 'alice' });
    expect(users.ssoUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'alice' }),
      { clientUID: 'acme' },
    );
  });

  it('honours a custom claim mapping', async () => {
    const users = makeUsers();
    const strategy = newStrategy(users, [CLIENT_UID], { externalUserId: 'uid', clientUID: 'tenant' });
    await strategy.validate({ uid: 'ext-9', tenant: 'globex' });
    expect(users.ssoUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ externalUserId: 'ext-9' }),
      { clientUID: 'globex' },
    );
  });

  it('derives an empty scope in standalone mode (no extensions configured)', async () => {
    const users = makeUsers();
    const strategy = newStrategy(users, []);
    const result = await strategy.validate({ sub: 'ext-1', client_uid: 'acme' });
    expect(users.ssoUpsert).toHaveBeenCalledWith(expect.any(Object), {});
    expect(result.scope).toEqual({});
  });

  it('rejects a token missing the external user id claim', async () => {
    const strategy = newStrategy(makeUsers(), [CLIENT_UID]);
    await expect(strategy.validate({ client_uid: 'acme' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an inactive user', async () => {
    const users = makeUsers({ active: false });
    const strategy = newStrategy(users, [CLIENT_UID]);
    await expect(
      strategy.validate({ sub: 'ext-1', client_uid: 'acme' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
