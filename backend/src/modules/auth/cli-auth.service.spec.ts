import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CliAuthService } from './cli-auth.service';

function makeUsers(adminRole: string | null = 'admin') {
  const sa = { _id: new Types.ObjectId(), email: 'agent-7@service.local', name: 'Agent 7' };
  return {
    sa,
    findById: jest.fn(async () => (adminRole ? { role: adminRole } : null)),
    ensureServiceAccount: jest.fn(async () => sa),
  };
}

function makeApiKeys() {
  return {
    mintForUser: jest.fn(async () => ({ token: 'shp_minted.secret' })),
  };
}

function newService(users: ReturnType<typeof makeUsers>, apiKeys: ReturnType<typeof makeApiKeys>) {
  return new CliAuthService({} as never, apiKeys as never, users as never);
}

describe('CliAuthService.provisionServiceAccount', () => {
  it('ensures the SA within the tenant, mints a key, and returns both', async () => {
    const users = makeUsers('admin');
    const apiKeys = makeApiKeys();
    const service = newService(users, apiKeys);
    const scope = { clientUID: 'acme' };

    const result = await service.provisionServiceAccount('agent-7', 'Agent 7', 'admin-id', scope);

    expect(users.ensureServiceAccount).toHaveBeenCalledWith(
      { externalUserId: 'agent-7', name: 'Agent 7' },
      scope,
    );
    expect(apiKeys.mintForUser).toHaveBeenCalledWith(
      String(users.sa._id),
      'Agent 7',
      [],
      undefined,
      scope,
    );
    expect(result).toEqual({
      apiKey: 'shp_minted.secret',
      user: { id: String(users.sa._id), email: 'agent-7@service.local', name: 'Agent 7' },
    });
  });

  it('checks the admin role globally (by id, NOT under the request tenant scope)', async () => {
    const users = makeUsers('admin');
    const service = newService(users, makeApiKeys());
    await service.provisionServiceAccount('agent-7', undefined, 'global-admin-id', {
      clientUID: 'acme',
    });
    // The role check must resolve the caller with an empty scope so an internal/
    // global admin (no tenant binding) can act on a tenant supplied by header.
    expect(users.findById).toHaveBeenCalledWith('global-admin-id', {});
  });

  it('rejects a non-admin caller', async () => {
    const users = makeUsers('operator');
    const service = newService(users, makeApiKeys());
    await expect(
      service.provisionServiceAccount('agent-7', undefined, 'op-id', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('defaults the key name from the externalUserId', async () => {
    const users = makeUsers('admin');
    const apiKeys = makeApiKeys();
    const service = newService(users, apiKeys);
    await service.provisionServiceAccount('agent-7', undefined, 'admin-id', {});
    expect(apiKeys.mintForUser).toHaveBeenCalledWith(
      String(users.sa._id),
      'sa-agent-7',
      [],
      undefined,
      {},
    );
  });
});
