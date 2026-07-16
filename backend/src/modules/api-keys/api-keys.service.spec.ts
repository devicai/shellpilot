import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ApiKeysService } from './api-keys.service';

const ADMIN_ID = 'a'.repeat(24);
const TARGET_ID = 'b'.repeat(24);

function makeService(opts?: { users?: Record<string, { email: string; role: string; name?: string }> }) {
  const users = {
    findById: jest.fn((id: string) => {
      const u = opts?.users?.[id];
      if (!u) return Promise.reject(new Error('User not found'));
      return Promise.resolve(u);
    }),
  };
  const repo = {
    create: jest.fn((doc: Record<string, unknown>) =>
      Promise.resolve({ ...doc, _id: new Types.ObjectId(), createdAt: new Date() }),
    ),
  };
  const config = { auth: { apiKeyPrefix: 'shp_' } };
  const svc = new ApiKeysService(repo as never, users as never, config as never, [] as never);
  return { svc, repo, users };
}

describe('ApiKeysService.resolveActor', () => {
  it('returns the delegated/JWT user untouched when present', async () => {
    const { svc } = makeService();
    const user = { id: ADMIN_ID, email: 'a@x.io', role: 'admin' as const };
    await expect(svc.resolveActor(user, { id: 'k', prefix: 'p', userId: TARGET_ID, scopes: [] }))
      .resolves.toBe(user);
  });

  it('falls back to the API key owner (role from the user record)', async () => {
    const { svc } = makeService({ users: { [TARGET_ID]: { email: 'o@x.io', role: 'operator', name: 'Op' } } });
    const actor = await svc.resolveActor(undefined, { id: 'k', prefix: 'p', userId: TARGET_ID, scopes: [] });
    expect(actor).toMatchObject({ id: TARGET_ID, email: 'o@x.io', role: 'operator' });
  });

  it('rejects when neither principal is present', async () => {
    const { svc } = makeService();
    await expect(svc.resolveActor(undefined, undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('ApiKeysService.create for another user', () => {
  it('admin mints a key for another user by id', async () => {
    const { svc } = makeService({ users: { [TARGET_ID]: { email: 't@x.io', role: 'viewer' } } });
    const issued = await svc.create(
      { name: 'cli', userId: TARGET_ID },
      { id: ADMIN_ID, email: 'a@x.io', role: 'admin' },
      {},
    );
    expect(issued.token).toMatch(/^shp_[0-9a-f]{8}\./);
  });

  it('non-admin cannot mint for someone else', async () => {
    const { svc } = makeService({ users: { [TARGET_ID]: { email: 't@x.io', role: 'viewer' } } });
    await expect(
      svc.create({ name: 'cli', userId: TARGET_ID }, { id: ADMIN_ID, email: 'a@x.io', role: 'viewer' }, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
