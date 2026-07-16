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

describe('CliAuthService.generateEnrollment', () => {
  function makeEnrollUsers() {
    const target = { _id: new Types.ObjectId(), email: 'emp@acme.com', name: 'Emp', role: 'viewer' };
    return { target, findById: jest.fn(async () => target) };
  }

  function makeRedis() {
    return { setex: jest.fn(async () => 'OK'), get: jest.fn(), del: jest.fn() };
  }

  it('honours the guard-verified admin role without re-checking the DB', async () => {
    // A trusted BFF (act-as) asserts the acting admin by header; the local
    // mirror may still hold the default role. The guard already vetted the
    // caller — a DB re-check here would 403 a valid delegated admin.
    const users = makeEnrollUsers();
    const redis = makeRedis();
    const service = new CliAuthService(redis as never, makeApiKeys() as never, users as never);
    const scope = { clientUID: 'acme' };
    const targetId = String(users.target._id);

    const result = await service.generateEnrollment(
      targetId,
      { id: 'delegated-admin-id', role: 'admin' },
      scope,
    );

    // Only the target user is resolved (tenant-scoped); the caller is never looked up.
    expect(users.findById).toHaveBeenCalledTimes(1);
    expect(users.findById).toHaveBeenCalledWith(targetId, scope);
    expect(redis.setex).toHaveBeenCalledWith(expect.stringContaining(result.enrollToken), 24 * 60 * 60, targetId);
    expect(result.userEmail).toBe('emp@acme.com');
    expect(result.enrollToken).toBeTruthy();
  });

  it('falls back to the DB admin check when the principal carries no role', async () => {
    const users = makeEnrollUsers(); // mirror role: viewer
    const redis = makeRedis();
    const service = new CliAuthService(redis as never, makeApiKeys() as never, users as never);

    await expect(
      service.generateEnrollment(String(users.target._id), { id: 'caller-id' }, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // The fallback resolves the caller globally (empty scope), like every requireAdmin.
    expect(users.findById).toHaveBeenCalledWith('caller-id', {});
    expect(redis.setex).not.toHaveBeenCalled();
  });
});

describe('CliAuthService.mintSelf', () => {
  function makeSelfUsers() {
    const me = { _id: new Types.ObjectId(), email: 'me@example.com', name: 'Me', role: 'viewer' };
    return { me, findById: jest.fn(async () => me) };
  }

  it('mints a key for the caller themselves, scoped to their tenant, with no admin check', async () => {
    const users = makeSelfUsers();
    const apiKeys = makeApiKeys();
    const service = new CliAuthService({} as never, apiKeys as never, users as never);
    const scope = { clientUID: 'acme' };
    const callerId = String(users.me._id);

    const result = await service.mintSelf(callerId, 'my-laptop', scope);

    // Resolved within the request tenant scope (not the empty admin-check scope).
    expect(users.findById).toHaveBeenCalledWith(callerId, scope);
    expect(apiKeys.mintForUser).toHaveBeenCalledWith(callerId, 'my-laptop', [], undefined, scope);
    expect(result).toEqual({
      apiKey: 'shp_minted.secret',
      user: { id: callerId, email: 'me@example.com', name: 'Me' },
    });
  });

  it('defaults the key name to cli-login-<date> when none is given', async () => {
    const users = makeSelfUsers();
    const apiKeys = makeApiKeys();
    const service = new CliAuthService({} as never, apiKeys as never, users as never);
    await service.mintSelf(String(users.me._id), undefined, {});
    const name = (apiKeys.mintForUser.mock.calls[0] as unknown[])[1] as string;
    expect(name).toMatch(/^cli-login-\d{4}-\d{2}-\d{2}$/);
  });
});
