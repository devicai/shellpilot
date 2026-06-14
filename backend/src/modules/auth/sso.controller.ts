import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExternalJwtAuthGuard } from './guards/external-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { AuthenticatedUser, ExtensionScope } from '../../interfaces';
import { UsersService } from '../users/users.service';

/**
 * SSO provisioning for users authenticated by the external identity provider.
 * Mounted only when `auth.providers.externalJwt.enabled` is true (see AuthModule).
 *
 * The external-jwt strategy already upserts the local user just-in-time when it
 * validates the token, so this endpoint's job is to return the resolved,
 * fully-populated local user to the caller (e.g. a management UI confirming the
 * binding and reading the user's profile/policy assignments). Calling it again is
 * idempotent.
 */
@ApiTags('Auth')
@ApiBearerAuth()
@UseGuards(ExternalJwtAuthGuard)
@Controller('users')
export class SsoController {
  constructor(private readonly users: UsersService) {}

  @Post('sso-upsert')
  @ApiOperation({
    summary: 'Provision/refresh the local user for the presented external token (SSO)',
  })
  ssoUpsert(@CurrentUser() user: AuthenticatedUser, @Scope() scope: ExtensionScope) {
    return this.users.findById(user.id, scope);
  }
}
