import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { Types } from 'mongoose';
import { CONFIG } from '../../../config/config.loader';
import {
  ClaimMapping,
  ExtensionProperty,
  ShellpilotModuleConfig,
} from '../../../config/config.types';
import { EXTENSIONS_TOKEN } from '../../../providers/extensions.provider';
import { deriveAuthScope } from '../../../common/scope/derive-auth-scope';
import { ExternalIdentity, UsersService } from '../../users/users.service';
import { AuthenticatedUser, ExtensionScope } from '../../../interfaces';

/**
 * Validates JWTs minted by an external identity provider (OIDC). The signature is
 * verified against the provider's JWKS endpoint; `iss` (and `aud` when configured)
 * are checked. The tenant and user id are read from configurable claims
 * (auth.providers.externalJwt.claimMapping). On a valid token the matching local
 * user is provisioned just-in-time, so no separate registration step is required.
 *
 * Registered only when `auth.providers.externalJwt.enabled` is true (see
 * AuthModule); nothing here loads in a standalone (local-only) deployment.
 */
@Injectable()
export class ExternalJwtStrategy extends PassportStrategy(Strategy, 'external-jwt') {
  private readonly claimMapping: ClaimMapping;

  constructor(
    @Inject(CONFIG) config: ShellpilotModuleConfig,
    @Inject(EXTENSIONS_TOKEN) private readonly extensions: ExtensionProperty[],
    private readonly users: UsersService,
  ) {
    const external = config.auth.providers.externalJwt;
    // Guarded at config load (resolveAuthProviders throws without these), but keep
    // a local assertion so the strategy never silently builds against undefined.
    if (!external.jwksUri || !external.issuer) {
      throw new Error('external-jwt provider requires jwksUri and issuer');
    }

    const options: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      issuer: external.issuer,
      // Resolve the signing key per-token from the provider's JWKS (cached).
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: external.jwksUri,
      }),
    };
    // Only enforce audience when configured; otherwise leave it unchecked.
    if (external.audience) options.audience = external.audience;

    super(options);
    this.claimMapping = external.claimMapping;
  }

  async validate(payload: Record<string, unknown>): Promise<AuthenticatedUser> {
    const externalUserId = this.readClaim(payload, this.claimMapping.externalUserId);
    if (!externalUserId) {
      throw new UnauthorizedException(
        `Token is missing the external user id claim '${this.claimMapping.externalUserId}'`,
      );
    }

    // The tenant claim populates the configured scope extension(s); in the common
    // single-key setup that is just `clientUID`. Identity pins the tenant — the
    // request can never be widened beyond it (see ExtensionScopeInterceptor).
    const tenantValue = payload[this.claimMapping.clientUID];
    const principal: Record<string, unknown> = {};
    for (const ext of this.extensions) {
      principal[ext.name] = tenantValue;
    }
    const scope: ExtensionScope = deriveAuthScope(principal, this.extensions);

    const identity: ExternalIdentity = {
      externalUserId,
      email: this.readClaim(payload, 'email'),
      name: this.readClaim(payload, 'name') ?? this.readClaim(payload, 'preferred_username'),
    };

    const user = (await this.users.ssoUpsert(identity, scope)) as unknown as {
      _id: Types.ObjectId;
      email: string;
      role: AuthenticatedUser['role'];
      name?: string;
      active: boolean;
    };
    if (!user.active) {
      throw new UnauthorizedException('User is not active');
    }

    return {
      id: String(user._id),
      email: user.email,
      role: user.role,
      name: user.name,
      scope,
    };
  }

  private readClaim(payload: Record<string, unknown>, claim: string): string | undefined {
    const value = payload[claim];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
