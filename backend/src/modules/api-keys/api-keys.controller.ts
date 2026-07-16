import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { JwtOrApiKeyGuard } from '../auth/guards/jwt-or-api-key.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentApiKey } from '../../common/decorators/current-api-key.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { AuthenticatedApiKey, AuthenticatedUser, ExtensionScope } from '../../interfaces';

/**
 * Accepts a JWT user, a user a trusted BFF acts as (act-as delegation), or a
 * raw API key (which manages the keys of its own owner). The acting principal
 * is resolved once per call; ApiKeysService enforces ownership/admin rules.
 */
@ApiTags('API Keys')
@ApiBearerAuth()
@ApiSecurity('x-api-key')
@UseGuards(JwtOrApiKeyGuard)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List API keys (own; admins see all)' })
  async list(
    @Scope() scope: ExtensionScope,
    @CurrentUser() user?: AuthenticatedUser,
    @CurrentApiKey() apiKey?: AuthenticatedApiKey,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const actor = await this.service.resolveActor(user, apiKey);
    return this.service.list(actor, scope, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create an API key. Plain token returned ONLY once.' })
  async create(
    @Body() dto: CreateApiKeyDto,
    @Scope() scope: ExtensionScope,
    @CurrentUser() user?: AuthenticatedUser,
    @CurrentApiKey() apiKey?: AuthenticatedApiKey,
  ) {
    const actor = await this.service.resolveActor(user, apiKey);
    return this.service.create(dto, actor, scope);
  }

  @Post(':id/rotate')
  @ApiOperation({ summary: 'Rotate an API key secret. New plain token returned ONLY once.' })
  async rotate(
    @Param('id') id: string,
    @Scope() scope: ExtensionScope,
    @CurrentUser() user?: AuthenticatedUser,
    @CurrentApiKey() apiKey?: AuthenticatedApiKey,
  ) {
    const actor = await this.service.resolveActor(user, apiKey);
    return this.service.rotate(id, actor, scope);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key' })
  async revoke(
    @Param('id') id: string,
    @Scope() scope: ExtensionScope,
    @CurrentUser() user?: AuthenticatedUser,
    @CurrentApiKey() apiKey?: AuthenticatedApiKey,
  ) {
    const actor = await this.service.resolveActor(user, apiKey);
    await this.service.revoke(id, actor, scope);
    return { status: 'ok' };
  }
}
