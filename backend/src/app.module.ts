import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { loadConfig } from './config/config.loader';
import { ConfigModule } from './config/config.module';
import { applyExtensions, applyExternalIdentityIndex } from './providers/extensions.provider';
import { ExtensionScopeInterceptor } from './interceptors/extension-scope.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './modules/users/users.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClisModule } from './modules/clis-catalog/clis.module';
import { RulesModule } from './modules/rules/rules.module';
import { CredentialsModule } from './modules/credentials/credentials.module';
import { TracesModule } from './modules/traces/traces.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { PublicConfigModule } from './modules/public-config/public-config.module';

import { UserSchema } from './modules/users/schema/user.schema';
import { ApiKeySchema } from './modules/api-keys/schema/api-key.schema';
import { CliSchema } from './modules/clis-catalog/schema/cli.schema';
import { PolicySchema } from './modules/rules/schema/policy.schema';
import { RuleSchema } from './modules/rules/schema/rule.schema';
import { VaultEntrySchema } from './modules/credentials/schema/vault-entry.schema';
import { TraceSchema } from './modules/traces/schema/trace.schema';
import { ProfileSchema } from './modules/profiles/schema/profile.schema';

const config = loadConfig();

// Apply extensions to schemas BEFORE model registration.
applyExtensions(UserSchema, 'User', config.extensions.properties);
// External-identity binding unique per tenant (partial: only SSO/service users).
applyExternalIdentityIndex(UserSchema, 'User', config.extensions.properties);
applyExtensions(ApiKeySchema, 'ApiKey', config.extensions.properties);
applyExtensions(CliSchema, 'Cli', config.extensions.properties);
applyExtensions(PolicySchema, 'Policy', config.extensions.properties);
applyExtensions(RuleSchema, 'Rule', config.extensions.properties);
applyExtensions(VaultEntrySchema, 'VaultEntry', config.extensions.properties);
applyExtensions(TraceSchema, 'Trace', config.extensions.properties);
applyExtensions(ProfileSchema, 'Profile', config.extensions.properties);

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forRoot(config.database.uri),
    RedisModule,
    HealthModule,
    PublicConfigModule,
    UsersModule,
    ApiKeysModule,
    AuthModule,
    ClisModule,
    RulesModule,
    CredentialsModule,
    TracesModule,
    ProfilesModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ExtensionScopeInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
