import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { JwtOrApiKeyGuard } from '../auth/guards/jwt-or-api-key.guard';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentApiKey } from '../../common/decorators/current-api-key.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { CredentialsService } from './credentials.service';
import { StoreCredentialDto } from './dto/store-credential.dto';
import { IssueCredentialDto } from './dto/issue-credential.dto';
import { VerifyCredentialDto } from './dto/verify-credential.dto';
import { AuthenticatedApiKey, AuthenticatedUser, ExtensionScope } from '../../interfaces';

@ApiTags('Credentials')
@Controller('credentials')
export class CredentialsController {
  constructor(private readonly service: CredentialsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtOrApiKeyGuard)
  @Post('store')
  @ApiOperation({ summary: 'Store an encrypted credential (JWT or trusted service caller)' })
  store(@Body() dto: StoreCredentialDto, @CurrentUser() user: AuthenticatedUser, @Scope() scope: ExtensionScope) {
    return this.service.store(dto, user, scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtOrApiKeyGuard)
  @Get()
  @ApiOperation({ summary: 'List credentials metadata (JWT or trusted service caller — secrets never returned)' })
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

  @ApiBearerAuth()
  @UseGuards(JwtOrApiKeyGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a stored credential (JWT or trusted service caller)' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Scope() scope: ExtensionScope) {
    await this.service.delete(id, user, scope);
    return { status: 'ok' };
  }

  @ApiSecurity('x-api-key')
  @UseGuards(ApiKeyAuthGuard)
  @Post('issue')
  @ApiOperation({ summary: "Issue a JIT token bound to the API key's identity + cli (Go wrapper)" })
  issue(
    @Body() dto: IssueCredentialDto,
    @CurrentApiKey() apiKey: AuthenticatedApiKey,
    @Scope() scope: ExtensionScope,
  ) {
    // Identity comes from the key, never the body.
    return this.service.issue({ ...dto, userId: apiKey.userId }, scope);
  }

  @ApiSecurity('x-api-key')
  @UseGuards(ApiKeyAuthGuard)
  @Post('verify')
  @ApiOperation({ summary: 'Consume a JIT token and resolve the underlying secret ONCE' })
  verify(@Body() dto: VerifyCredentialDto, @Scope() scope: ExtensionScope) {
    return this.service.verify(dto, scope);
  }
}
