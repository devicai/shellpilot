import { CatalogController } from './catalog.controller';
import { JwtOrApiKeyGuard } from '../auth/guards/jwt-or-api-key.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

describe('CatalogController — guard wiring', () => {
  it('accepts a JWT or a trusted service caller, then enforces roles', () => {
    const guards = Reflect.getMetadata('__guards__', CatalogController) ?? [];
    expect(guards).toContain(JwtOrApiKeyGuard);
    expect(guards).toContain(RolesGuard);
  });

  it('is restricted to admin and operator roles', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, CatalogController) ?? [];
    expect(roles).toEqual(['admin', 'operator']);
  });
});
