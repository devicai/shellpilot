import { UsersController } from './users.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

describe('UsersController — ensure (pre-provision)', () => {
  it('is restricted to the admin role', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, UsersController.prototype.ensure) ?? [];
    expect(roles).toEqual(['admin']);
  });

  it('find-or-creates a passwordless user by external identity via ssoUpsert', async () => {
    const ssoUpsert = jest.fn().mockResolvedValue({ id: 'u1', externalUserId: 'ext-1' });
    const controller = new UsersController({ ssoUpsert } as any);
    const scope = { clientUID: 'acme' };
    const dto = { externalUserId: 'ext-1', email: 'a@example.com', name: 'A' };

    const result = await controller.ensure(dto as any, scope as any);

    expect(ssoUpsert).toHaveBeenCalledWith(dto, scope);
    expect(result).toEqual({ id: 'u1', externalUserId: 'ext-1' });
  });
});
