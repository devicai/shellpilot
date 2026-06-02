import { CredentialsController } from './credentials.controller';
import { JwtOrApiKeyGuard } from '../auth/guards/jwt-or-api-key.guard';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';

/** Reads the guards attached to a controller method via @UseGuards. */
function guardsOf(method: (...args: any[]) => any): unknown[] {
  return Reflect.getMetadata('__guards__', method) ?? [];
}

describe('CredentialsController — guard wiring', () => {
  const proto = CredentialsController.prototype;

  it('management routes accept a JWT or a trusted service caller (act-as)', () => {
    expect(guardsOf(proto.store)).toContain(JwtOrApiKeyGuard);
    expect(guardsOf(proto.list)).toContain(JwtOrApiKeyGuard);
    expect(guardsOf(proto.remove)).toContain(JwtOrApiKeyGuard);
  });

  it('wrapper-only JIT routes stay API-key only', () => {
    expect(guardsOf(proto.issue)).toContain(ApiKeyAuthGuard);
    expect(guardsOf(proto.verify)).toContain(ApiKeyAuthGuard);
    expect(guardsOf(proto.issue)).not.toContain(JwtOrApiKeyGuard);
    expect(guardsOf(proto.verify)).not.toContain(JwtOrApiKeyGuard);
  });
});
