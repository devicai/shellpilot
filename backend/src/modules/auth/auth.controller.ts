import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CliAuthService } from './cli-auth.service';
import { LoginDto } from './dto/login.dto';
import {
  ProvisionDto,
  ProvisionServiceAccountDto,
  GenerateEnrollmentDto,
  EnrollDto,
} from './dto/cli-auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { JwtOrApiKeyGuard } from './guards/jwt-or-api-key.guard';
import { RolesGuard } from './guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentApiKey } from '../../common/decorators/current-api-key.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { AuthenticatedApiKey, AuthenticatedUser, ExtensionScope } from '../../interfaces';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly cliAuth: CliAuthService,
  ) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login with email + password, returns JWT' })
  login(@Body() dto: LoginDto) {
    return this.service.login(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Current authenticated user' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh JWT for current user' })
  refresh(@CurrentUser() user: AuthenticatedUser) {
    return this.service.refresh(user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiOperation({ summary: 'Logout (client-side token discard)' })
  logout() {
    return { status: 'ok' };
  }

  // --- CLI authentication flows ---

  @ApiBearerAuth()
  @ApiSecurity('x-api-key')
  @UseGuards(JwtOrApiKeyGuard)
  @Get('whoami')
  @ApiOperation({ summary: 'Identity behind the JWT or API key (used by the CLI `whoami`)' })
  whoami(
    @Scope() scope: ExtensionScope,
    @CurrentUser() user?: AuthenticatedUser,
    @CurrentApiKey() apiKey?: AuthenticatedApiKey,
  ) {
    if (user) return { id: user.id, email: user.email, name: user.name };
    return this.cliAuth.whoami(apiKey!.userId, scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('enrollment')
  @ApiOperation({ summary: 'Admin: generate a single-use enrollment token for a user (case 3)' })
  generateEnrollment(
    @Body() dto: GenerateEnrollmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope: ExtensionScope,
  ) {
    return this.cliAuth.generateEnrollment(dto.userId, user.id, scope);
  }

  @ApiSecurity('x-api-key')
  @UseGuards(ApiKeyAuthGuard)
  @Post('enroll')
  @ApiOperation({ summary: 'Redeem an enrollment token for an API key (admin API key authorises) (case 3)' })
  enroll(@Body() dto: EnrollDto, @CurrentApiKey() apiKey: AuthenticatedApiKey, @Scope() scope: ExtensionScope) {
    return this.cliAuth.redeemEnrollment(dto.enrollToken, apiKey.userId, scope);
  }

  @ApiSecurity('x-api-key')
  @UseGuards(ApiKeyAuthGuard)
  @Post('provision')
  @ApiOperation({ summary: 'Admin: mint an API key for a service account by id/email (case 1)' })
  provision(@Body() dto: ProvisionDto, @CurrentApiKey() apiKey: AuthenticatedApiKey, @Scope() scope: ExtensionScope) {
    return this.cliAuth.provision(dto.serviceAccount, dto.name, apiKey.userId, scope);
  }

  @ApiSecurity('x-api-key')
  @UseGuards(ApiKeyAuthGuard)
  @Post('service-account')
  @ApiOperation({
    summary: 'Admin: ensure a service account by external entity id and mint an API key for it',
  })
  provisionServiceAccount(
    @Body() dto: ProvisionServiceAccountDto,
    @CurrentApiKey() apiKey: AuthenticatedApiKey,
    @Scope() scope: ExtensionScope,
  ) {
    return this.cliAuth.provisionServiceAccount(dto.externalUserId, dto.name, apiKey.userId, scope);
  }
}
