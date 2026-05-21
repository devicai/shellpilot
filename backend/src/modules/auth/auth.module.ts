import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CONFIG } from '../../config/config.loader';
import { ShellpilotModuleConfig } from '../../config/config.types';
import { UsersModule } from '../users/users.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { JwtOrApiKeyGuard } from './guards/jwt-or-api-key.guard';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  imports: [
    PassportModule,
    UsersModule,
    ApiKeysModule,
    JwtModule.registerAsync({
      inject: [CONFIG],
      useFactory: (config: ShellpilotModuleConfig) => ({
        secret: config.auth.jwt.secret,
        signOptions: { expiresIn: config.auth.jwt.expiresIn as unknown as number },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    ApiKeyAuthGuard,
    JwtOrApiKeyGuard,
    RolesGuard,
  ],
  exports: [AuthService, JwtAuthGuard, ApiKeyAuthGuard, JwtOrApiKeyGuard, RolesGuard],
})
export class AuthModule {}
