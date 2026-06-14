import { resolveAuthProviders } from './config.loader';

describe('resolveAuthProviders', () => {
  it('defaults to local-only with CLI login served locally (standalone unchanged)', () => {
    const { providers, cliLogin } = resolveAuthProviders(undefined);
    expect(providers.local.enabled).toBe(true);
    expect(providers.externalJwt.enabled).toBe(false);
    expect(cliLogin.redirectTo).toBe('');
  });

  it('treats an auth block without a providers section as local-only', () => {
    const { providers } = resolveAuthProviders({ jwt: { secret: 'x', expiresIn: '8h' } });
    expect(providers.local.enabled).toBe(true);
    expect(providers.externalJwt.enabled).toBe(false);
  });

  it('applies default claim mapping when external-jwt is enabled', () => {
    const { providers } = resolveAuthProviders({
      providers: {
        externalJwt: { enabled: true, jwksUri: 'https://id.example.com/jwks.json', issuer: 'https://id.example.com' },
      },
    });
    expect(providers.externalJwt.enabled).toBe(true);
    expect(providers.externalJwt.claimMapping).toEqual({ externalUserId: 'sub', clientUID: 'client_uid' });
  });

  it('honours a custom claim mapping and audience', () => {
    const { providers } = resolveAuthProviders({
      providers: {
        externalJwt: {
          enabled: true,
          jwksUri: 'https://id.example.com/jwks.json',
          issuer: 'https://id.example.com',
          audience: 'shellpilot',
          claimMapping: { externalUserId: 'uid', clientUID: 'tenant' },
        },
      },
    });
    expect(providers.externalJwt.audience).toBe('shellpilot');
    expect(providers.externalJwt.claimMapping).toEqual({ externalUserId: 'uid', clientUID: 'tenant' });
  });

  it('allows disabling the local provider', () => {
    const { providers } = resolveAuthProviders({ providers: { local: { enabled: false } } });
    expect(providers.local.enabled).toBe(false);
  });

  it('throws when external-jwt is enabled without jwksUri or issuer', () => {
    expect(() => resolveAuthProviders({ providers: { externalJwt: { enabled: true } } })).toThrow(/jwksUri/);
    expect(() =>
      resolveAuthProviders({ providers: { externalJwt: { enabled: true, jwksUri: 'https://id.example.com/jwks.json' } } }),
    ).toThrow();
  });

  it('reads the CLI login redirect target', () => {
    const { cliLogin } = resolveAuthProviders({ cliLogin: { redirectTo: 'https://id.example.com/login' } });
    expect(cliLogin.redirectTo).toBe('https://id.example.com/login');
  });
});
