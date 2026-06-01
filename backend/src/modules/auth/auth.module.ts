import { Global, Module, Provider, Type } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CONFIG, loadConfig } from '../../config/config.loader';
import { ShellpilotModuleConfig } from '../../config/config.types';
import { UsersModule } from '../users/users.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AuthService } from './auth.service';
import { CliAuthService } from './cli-auth.service';
import { AuthController } from './auth.controller';
import { SsoController } from './sso.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ExternalJwtStrategy } from './strategies/external-jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ExternalJwtAuthGuard } from './guards/external-jwt-auth.guard';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { JwtOrApiKeyGuard } from './guards/jwt-or-api-key.guard';
import { RolesGuard } from './guards/roles.guard';

// Passport strategies are registered conditionally based on the enabled auth
// providers (config.yml → auth.providers). Standalone defaults to `local`, so the
// local JWT strategy is always present unless explicitly disabled. The
// `external-jwt` strategy and its SSO endpoint load ONLY when that provider is
// enabled, so a standalone (local-only) deployment is byte-for-byte unchanged.
const config = loadConfig();
const externalJwtEnabled = config.auth.providers.externalJwt.enabled;

const strategyProviders: Provider[] = [];
if (config.auth.providers.local.enabled) {
  strategyProviders.push(JwtStrategy);
}
if (externalJwtEnabled) {
  strategyProviders.push(ExternalJwtStrategy);
}

// The SSO upsert endpoint only exists when external-jwt is on (it requires a
// valid external token to authenticate).
const controllers: Type<unknown>[] = [AuthController];
if (externalJwtEnabled) {
  controllers.push(SsoController);
}

@Global()
@Module({
  imports: [
    PassportModule,
    UsersModule,
    ApiKeysModule,
    JwtModule.registerAsync({
      inject: [CONFIG],
      useFactory: (cfg: ShellpilotModuleConfig) => ({
        secret: cfg.auth.jwt.secret,
        signOptions: { expiresIn: cfg.auth.jwt.expiresIn as unknown as number },
      }),
    }),
  ],
  controllers,
  providers: [
    AuthService,
    CliAuthService,
    ...strategyProviders,
    JwtAuthGuard,
    ExternalJwtAuthGuard,
    ApiKeyAuthGuard,
    JwtOrApiKeyGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    CliAuthService,
    JwtAuthGuard,
    ExternalJwtAuthGuard,
    ApiKeyAuthGuard,
    JwtOrApiKeyGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
