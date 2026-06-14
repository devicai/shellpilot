import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CONFIG } from '../../config/config.loader';
import { AuthProviderName, ShellpilotModuleConfig } from '../../config/config.types';
import { Public } from '../../common/decorators/public.decorator';

export interface PublicConfig {
  auth: {
    /** Enabled authentication providers, in display order. */
    providers: AuthProviderName[];
    /** External login URL to bounce the browser to, or null to use the local form. */
    externalLoginUrl: string | null;
  };
}

/**
 * Derives the unauthenticated bootstrap config the SPA reads at startup to decide
 * how to render the login experience. Pure so it can be unit-tested without DI.
 */
export function buildPublicConfig(config: ShellpilotModuleConfig): PublicConfig {
  const providers: AuthProviderName[] = [];
  if (config.auth.providers.local.enabled) providers.push('local');
  if (config.auth.providers.externalJwt.enabled) providers.push('external-jwt');

  return {
    auth: {
      providers,
      externalLoginUrl: config.auth.cliLogin.redirectTo || null,
    },
  };
}

@ApiTags('Public')
@Controller('public-config')
export class PublicConfigController {
  constructor(@Inject(CONFIG) private readonly config: ShellpilotModuleConfig) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Unauthenticated client bootstrap config (enabled auth providers + external login URL)',
  })
  getPublicConfig(): PublicConfig {
    return buildPublicConfig(this.config);
  }
}
