import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { ApiKeyAuthGuard } from './api-key-auth.guard';

/** Minimal ExecutionContext wrapping a fake express request. */
function ctx(req: Record<string, any>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const EXTENSIONS = [
  { name: 'clientUID', headerName: 'x-client-uid', type: 'string', required: false },
] as any;

function verifyResult(scopes: string[]) {
  return {
    id: 'key1',
    apiKey: { prefix: 'shp_abc', userId: 'owner1', scopes },
    scope: {},
  };
}

describe('ApiKeyAuthGuard — act-as delegation', () => {
  let apiKeys: { verify: jest.Mock };
  let users: { ssoUpsert: jest.Mock };
  let guard: ApiKeyAuthGuard;

  beforeEach(() => {
    apiKeys = { verify: jest.fn() };
    users = { ssoUpsert: jest.fn() };
    guard = new ApiKeyAuthGuard(apiKeys as any, users as any, EXTENSIONS);
  });

  it('rejects a request with no x-api-key header', async () => {
    await expect(guard.canActivate(ctx({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid api key', async () => {
    apiKeys.verify.mockResolvedValue(null);
    await expect(
      guard.canActivate(ctx({ headers: { 'x-api-key': 'bad' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('an ordinary key (no act-as scope) ignores x-user-uid and is NOT delegated', async () => {
    apiKeys.verify.mockResolvedValue(verifyResult([]));
    const req: any = { headers: { 'x-api-key': 'shp_x', 'x-user-uid': 'victim', 'x-client-uid': 't1' } };

    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);

    expect(users.ssoUpsert).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(req.apiKey.userId).toBe('owner1');
  });

  it('an act-as key WITHOUT x-user-uid acts as itself (no delegation)', async () => {
    apiKeys.verify.mockResolvedValue(verifyResult(['act-as']));
    const req: any = { headers: { 'x-api-key': 'shp_svc', 'x-client-uid': 't1' } };

    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);

    expect(users.ssoUpsert).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('an act-as key WITH x-user-uid is delegated to that user, tenant from header, role propagated', async () => {
    apiKeys.verify.mockResolvedValue(verifyResult(['act-as']));
    users.ssoUpsert.mockResolvedValue({ _id: 'u1', email: 'pablo@example.com', name: 'Pablo', role: 'viewer' });
    const req: any = {
      headers: {
        'x-api-key': 'shp_svc',
        'x-client-uid': 't1',
        'x-user-uid': 'ext-user-1',
        'x-user-role': 'admin',
        'x-user-email': 'pablo@example.com',
        'x-user-name': 'Pablo',
      },
    };

    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);

    expect(users.ssoUpsert).toHaveBeenCalledWith(
      { externalUserId: 'ext-user-1', email: 'pablo@example.com', name: 'Pablo' },
      { clientUID: 't1' },
    );
    expect(req.user).toEqual({
      id: 'u1',
      email: 'pablo@example.com',
      name: 'Pablo',
      role: 'admin', // propagated, overrides the JIT'd viewer
      scope: { clientUID: 't1' },
    });
  });

  it('falls back to the stored role when the propagated role is missing/invalid', async () => {
    apiKeys.verify.mockResolvedValue(verifyResult(['act-as']));
    users.ssoUpsert.mockResolvedValue({ _id: 'u1', email: 'a@example.com', name: 'A', role: 'operator' });
    const req: any = {
      headers: { 'x-api-key': 'shp_svc', 'x-client-uid': 't1', 'x-user-uid': 'u', 'x-user-role': 'root' },
    };

    await guard.canActivate(ctx(req));

    expect(req.user.role).toBe('operator');
  });
});
