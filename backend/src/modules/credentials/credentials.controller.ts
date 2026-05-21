import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { CredentialsService } from './credentials.service';
import { StoreCredentialDto } from './dto/store-credential.dto';
import { IssueCredentialDto } from './dto/issue-credential.dto';
import { VerifyCredentialDto } from './dto/verify-credential.dto';
import { AuthenticatedUser, ExtensionScope } from '../../interfaces';

@ApiTags('Credentials')
@Controller('credentials')
export class CredentialsController {
  constructor(private readonly service: CredentialsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('store')
  @ApiOperation({ summary: 'Store an encrypted credential (JWT)' })
  store(@Body() dto: StoreCredentialDto, @CurrentUser() user: AuthenticatedUser, @Scope() scope: ExtensionScope) {
    return this.service.store(dto, user, scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'List credentials metadata (JWT — secrets never returned)' })
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
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a stored credential (JWT)' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Scope() scope: ExtensionScope) {
    await this.service.delete(id, user, scope);
    return { status: 'ok' };
  }

  @ApiSecurity('x-api-key')
  @UseGuards(ApiKeyAuthGuard)
  @Post('issue')
  @ApiOperation({ summary: 'Issue a JIT token bound to userId+cli (consumed by Go wrapper)' })
  issue(@Body() dto: IssueCredentialDto) {
    return this.service.issue(dto);
  }

  @ApiSecurity('x-api-key')
  @UseGuards(ApiKeyAuthGuard)
  @Post('verify')
  @ApiOperation({ summary: 'Consume a JIT token and resolve the underlying secret ONCE' })
  verify(@Body() dto: VerifyCredentialDto) {
    return this.service.verify(dto);
  }
}
