import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClisService } from './clis.service';
import { CreateCliDto } from './dto/create-cli.dto';
import { UpdateCliDto } from './dto/update-cli.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtOrApiKeyGuard } from '../auth/guards/jwt-or-api-key.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { ExtensionScope } from '../../interfaces';

@ApiTags('CLIs Catalog')
@Controller('clis')
export class ClisController {
  constructor(private readonly service: ClisService) {}

  @ApiBearerAuth()
  @UseGuards(JwtOrApiKeyGuard)
  @Get()
  @ApiOperation({ summary: 'List CLIs (JWT or API key — consumed by the Go wrapper)' })
  list(
    @Scope() scope: ExtensionScope,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.list(scope, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtOrApiKeyGuard)
  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Get CLI by id or slug' })
  findOne(@Param('idOrSlug') idOrSlug: string, @Scope() scope: ExtensionScope) {
    return this.service.findOne(idOrSlug, scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator')
  @Post()
  @ApiOperation({ summary: 'Create CLI (admin/operator)' })
  create(@Body() dto: CreateCliDto, @Scope() scope: ExtensionScope) {
    return this.service.create(dto, scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator')
  @Patch(':id')
  @ApiOperation({ summary: 'Update CLI (admin/operator)' })
  update(@Param('id') id: string, @Body() dto: UpdateCliDto, @Scope() scope: ExtensionScope) {
    return this.service.update(id, dto, scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete CLI (admin)' })
  async remove(@Param('id') id: string, @Scope() scope: ExtensionScope) {
    await this.service.delete(id, scope);
    return { status: 'ok' };
  }
}
