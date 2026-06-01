import { buildPublicConfig } from './public-config.controller';
import { ShellpilotModuleConfig } from '../../config/config.types';

function configWith(authOverrides: Partial<ShellpilotModuleConfig['auth']>): ShellpilotModuleConfig {
  return {
    auth: {
      jwt: { secret: 'x', expiresIn: '8h' },
      apiKeyPrefix: 'shp_',
      providers: {
        local: { enabled: true },
        externalJwt: { enabled: false, claimMapping: { externalUserId: 'sub', clientUID: 'client_uid' } },
      },
      cliLogin: { redirectTo: '' },
      ...authOverrides,
    },
  } as ShellpilotModuleConfig;
}

describe('buildPublicConfig', () => {
  it('reports local-only with no external login URL by default (standalone)', () => {
    const result = buildPublicConfig(configWith({}));
    expect(result.auth.providers).toEqual(['local']);
    expect(result.auth.externalLoginUrl).toBeNull();
  });

  it('reports external-jwt and the external login URL when configured', () => {
    const result = buildPublicConfig(
      configWith({
        providers: {
          local: { enabled: false },
          externalJwt: {
            enabled: true,
            jwksUri: 'https://id.example.com/jwks.json',
            issuer: 'https://id.example.com',
            claimMapping: { externalUserId: 'sub', clientUID: 'client_uid' },
          },
        },
        cliLogin: { redirectTo: 'https://id.example.com/login' },
      }),
    );
    expect(result.auth.providers).toEqual(['external-jwt']);
    expect(result.auth.externalLoginUrl).toBe('https://id.example.com/login');
  });

  it('lists both providers when both are enabled', () => {
    const result = buildPublicConfig(
      configWith({
        providers: {
          local: { enabled: true },
          externalJwt: {
            enabled: true,
            jwksUri: 'https://id.example.com/jwks.json',
            issuer: 'https://id.example.com',
            claimMapping: { externalUserId: 'sub', clientUID: 'client_uid' },
          },
        },
      }),
    );
    expect(result.auth.providers).toEqual(['local', 'external-jwt']);
  });
});
