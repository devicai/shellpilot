import { deriveAuthScope } from './derive-auth-scope';
import { ExtensionProperty } from '../../config/config.types';

const CLIENT_UID: ExtensionProperty = {
  name: 'clientUID',
  type: 'string',
  required: true,
  index: true,
  entities: '*',
  source: 'header',
  headerName: 'x-client-uid',
};

describe('deriveAuthScope', () => {
  it('returns an empty scope when no extensions are configured (standalone)', () => {
    expect(deriveAuthScope({ clientUID: 'acme' }, [])).toEqual({});
  });

  it('pins the tenant from a principal that carries the extension value', () => {
    expect(deriveAuthScope({ clientUID: 'acme', email: 'a@acme.com' }, [CLIENT_UID])).toEqual({
      clientUID: 'acme',
    });
  });

  it('returns an empty scope for a global principal lacking the extension value', () => {
    // e.g. a cross-tenant admin/internal key — the header is allowed to supply the tenant.
    expect(deriveAuthScope({ email: 'root@system' }, [CLIENT_UID])).toEqual({});
  });

  it('ignores fields that are not configured extensions', () => {
    expect(deriveAuthScope({ clientUID: 'acme', role: 'admin' }, [CLIENT_UID])).toEqual({
      clientUID: 'acme',
    });
  });

  it('handles null / non-object principals', () => {
    expect(deriveAuthScope(null, [CLIENT_UID])).toEqual({});
    expect(deriveAuthScope(undefined, [CLIENT_UID])).toEqual({});
    expect(deriveAuthScope('nope' as unknown, [CLIENT_UID])).toEqual({});
  });

  it('coerces non-string extension values to strings', () => {
    const numeric: ExtensionProperty = { ...CLIENT_UID, name: 'tenantNo', type: 'number' };
    expect(deriveAuthScope({ tenantNo: 42 }, [numeric])).toEqual({ tenantNo: '42' });
  });
});
