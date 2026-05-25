import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { ClisService } from './clis.service';
import { ClisImportExportService } from './import-export.service';
import { CreateCliDto } from './dto/create-cli.dto';
import { UpdateCliDto } from './dto/update-cli.dto';
import { ImportCatalogDto } from './dto/import-catalog.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtOrApiKeyGuard } from '../auth/guards/jwt-or-api-key.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { ExtensionScope } from '../../interfaces';

@ApiTags('CLIs Catalog')
@Controller('clis')
export class ClisController {
  constructor(
    private readonly service: ClisService,
    private readonly importExport: ClisImportExportService,
  ) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator')
  @Post('import')
  @ApiOperation({
    summary:
      'Bulk import a catalog from YAML. Accepts inline content or fetches from a URL (e.g. a devicai/cli-definitions repo).',
  })
  import(@Body() dto: ImportCatalogDto, @Scope() scope: ExtensionScope) {
    return this.importExport.importYaml(dto.content, { overwrite: dto.overwrite }, scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'operator')
  @Get('export.yaml')
  @Header('Content-Type', 'application/yaml; charset=utf-8')
  @ApiProduces('application/yaml')
  @ApiOperation({ summary: 'Export the current catalog as YAML (round-trips through /import)' })
  export(@Scope() scope: ExtensionScope) {
    return this.importExport.exportYaml(scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtOrApiKeyGuard)
  @Get()
  @ApiOperation({ summary: 'List CLIs (JWT or API key — consumed by the Go wrapper)' })
  list(
    @Scope() scope: ExtensionScope,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('slug') slug?: string,
  ) {
    return this.service.list(scope, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      slug,
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
