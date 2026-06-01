import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { UsersService } from './users.service';

type AnyRec = Record<string, unknown>;

function makeRepo() {
  const calls: { create: AnyRec[]; updateById: Array<[string, AnyRec, AnyRec]> } = {
    create: [],
    updateById: [],
  };
  let byExternal: AnyRec | null = null;
  const repo = {
    calls,
    setExisting(doc: AnyRec | null) {
      byExternal = doc;
    },
    findByExternalUserId: jest.fn(async () => byExternal),
    create: jest.fn(async (doc: AnyRec) => {
      calls.create.push(doc);
      return { _id: new Types.ObjectId(), ...doc };
    }),
    updateById: jest.fn(async (id: string, patch: AnyRec, scope: AnyRec) => {
      calls.updateById.push([id, patch, scope]);
      // Return the merged doc so callers see the update applied.
      return { _id: new Types.ObjectId(id), ...(byExternal ?? {}), ...patch };
    }),
  };
  return repo;
}

function makeRules() {
  return {
    createPolicy: jest.fn(async () => ({ _id: new Types.ObjectId() })),
  };
}

function newService(repo: ReturnType<typeof makeRepo>, rules: ReturnType<typeof makeRules>) {
  // Config is unused by the upsert paths; pass a minimal stub.
  return new UsersService(repo as never, {} as never, rules as never);
}

describe('UsersService external-identity upsert', () => {
  describe('ssoUpsert', () => {
    it('creates a passwordless human user with the external binding and individual rules', async () => {
      const repo = makeRepo();
      const rules = makeRules();
      const service = newService(repo, rules);

      const scope = { clientUID: 'acme' };
      await service.ssoUpsert(
        { externalUserId: 'ext-1', email: 'Alice@Acme.com', name: 'Alice' },
        scope,
      );

      const created = repo.calls.create[0];
      expect(created).toMatchObject({
        email: 'alice@acme.com', // lowercased
        name: 'Alice',
        type: 'human',
        role: 'viewer',
        externalUserId: 'ext-1',
        active: true,
      });
      expect(created.passwordHash).toBeUndefined();
      // tenant scope is threaded into the create
      expect((repo.findByExternalUserId as jest.Mock).mock.calls[0][1]).toEqual(scope);
      expect((repo.create as jest.Mock).mock.calls[0][1]).toEqual(scope);
      // individual rules created + assigned
      expect(rules.createPolicy).toHaveBeenCalledTimes(1);
      expect(repo.calls.updateById[0][1]).toHaveProperty('policyId');
    });

    it('synthesises an email when the provider supplies none', async () => {
      const repo = makeRepo();
      const service = newService(repo, makeRules());
      await service.ssoUpsert({ externalUserId: 'user|42' }, {});
      expect(repo.calls.create[0].email).toBe('user-42@sso.local');
    });

    it('is idempotent: an existing binding is returned without re-creating', async () => {
      const repo = makeRepo();
      const rules = makeRules();
      repo.setExisting({
        _id: new Types.ObjectId(),
        email: 'alice@acme.com',
        name: 'Alice',
        externalUserId: 'ext-1',
        role: 'admin',
      });
      const service = newService(repo, rules);

      await service.ssoUpsert({ externalUserId: 'ext-1', email: 'alice@acme.com', name: 'Alice' }, {});

      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.updateById).not.toHaveBeenCalled();
      expect(rules.createPolicy).not.toHaveBeenCalled();
    });

    it('refreshes a changed email/name but never touches local role/profile', async () => {
      const repo = makeRepo();
      const existingId = new Types.ObjectId();
      repo.setExisting({
        _id: existingId,
        email: 'old@acme.com',
        name: 'Old Name',
        externalUserId: 'ext-1',
        role: 'admin',
      });
      const service = newService(repo, makeRules());

      await service.ssoUpsert({ externalUserId: 'ext-1', email: 'New@Acme.com', name: 'New Name' }, {});

      expect(repo.create).not.toHaveBeenCalled();
      const [, patch] = repo.calls.updateById[0];
      expect(patch).toEqual({ email: 'new@acme.com', name: 'New Name' });
      expect(patch).not.toHaveProperty('role');
      expect(patch).not.toHaveProperty('profileId');
    });

    it('throws when externalUserId is missing', async () => {
      const service = newService(makeRepo(), makeRules());
      await expect(service.ssoUpsert({ externalUserId: '   ' }, {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('ensureServiceAccount', () => {
    it('creates a passwordless service user defaulting to operator', async () => {
      const repo = makeRepo();
      const service = newService(repo, makeRules());
      await service.ensureServiceAccount({ externalUserId: 'agent-7', name: 'Agent 7' }, {
        clientUID: 'acme',
      });
      const created = repo.calls.create[0];
      expect(created).toMatchObject({
        type: 'service',
        role: 'operator',
        externalUserId: 'agent-7',
        name: 'Agent 7',
      });
      expect(created.passwordHash).toBeUndefined();
      expect(created.email).toBe('agent-7@service.local');
    });

    it('is idempotent on the service account', async () => {
      const repo = makeRepo();
      repo.setExisting({ _id: new Types.ObjectId(), email: 'agent-7@service.local', name: 'Agent 7', externalUserId: 'agent-7' });
      const service = newService(repo, makeRules());
      await service.ensureServiceAccount({ externalUserId: 'agent-7' }, {});
      expect(repo.create).not.toHaveBeenCalled();
    });
  });
});
