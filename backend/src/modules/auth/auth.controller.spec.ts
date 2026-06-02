import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtOrApiKeyGuard } from './guards/jwt-or-api-key.guard';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

/** Reads the guards attached to a controller method via @UseGuards. */
function guardsOf(method: (...args: any[]) => any): unknown[] {
  return Reflect.getMetadata('__guards__', method) ?? [];
}

describe('AuthController — guard wiring', () => {
  const proto = AuthController.prototype;

  it('enrollment generation accepts a JWT admin or a trusted caller acting as admin', () => {
    // Lets a trusted BFF caller generate an enrollment token on behalf of an
    // admin (act-as) — that caller has no JWT of its own.
    expect(guardsOf(proto.generateEnrollment)).toContain(JwtOrApiKeyGuard);
    expect(guardsOf(proto.generateEnrollment)).toContain(RolesGuard);
    expect(guardsOf(proto.generateEnrollment)).not.toContain(JwtAuthGuard);
    const roles = Reflect.getMetadata(ROLES_KEY, proto.generateEnrollment) ?? [];
    expect(roles).toEqual(['admin']);
  });

  it('wrapper/CLI-only flows stay API-key only', () => {
    // These are reached by the Go wrapper with a raw API key, never act-as.
    expect(guardsOf(proto.enroll)).toContain(ApiKeyAuthGuard);
    expect(guardsOf(proto.provision)).toContain(ApiKeyAuthGuard);
    expect(guardsOf(proto.provisionServiceAccount)).toContain(ApiKeyAuthGuard);
    expect(guardsOf(proto.enroll)).not.toContain(JwtOrApiKeyGuard);
  });

  it('whoami accepts both a JWT and an API key', () => {
    expect(guardsOf(proto.whoami)).toContain(JwtOrApiKeyGuard);
  });
});
