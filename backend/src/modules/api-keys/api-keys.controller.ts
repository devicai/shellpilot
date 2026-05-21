import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { AuthenticatedUser, ExtensionScope } from '../../interfaces';

@ApiTags('API Keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List API keys (own; admins see all)' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Scope() scope: ExtensionScope,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.list(user, scope, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create an API key. Plain token returned ONLY once.' })
  create(@Body() dto: CreateApiKeyDto, @CurrentUser() user: AuthenticatedUser, @Scope() scope: ExtensionScope) {
    return this.service.create(dto, user, scope);
  }

  @Post(':id/rotate')
  @ApiOperation({ summary: 'Rotate an API key secret. New plain token returned ONLY once.' })
  rotate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Scope() scope: ExtensionScope) {
    return this.service.rotate(id, user, scope);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key' })
  async revoke(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Scope() scope: ExtensionScope) {
    await this.service.revoke(id, user, scope);
    return { status: 'ok' };
  }
}
