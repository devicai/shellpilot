import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogRegistryService } from './catalog-registry.service';
import { ImportRegistryDto } from './dto/import-registry.dto';
import { JwtOrApiKeyGuard } from '../auth/guards/jwt-or-api-key.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { ExtensionScope } from '../../interfaces';

// Public CLI catalog registry. Browse the official catalog (served from a Git
// repo via the backend), preview an entry, and import it into the local DB.
// Imported entries are pinned to their source version; updates are opt-in.
@ApiTags('CLI Catalog Registry')
@ApiBearerAuth()
@UseGuards(JwtOrApiKeyGuard, RolesGuard)
@Roles('admin', 'operator')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly registry: CatalogRegistryService) {}

  @Get('registry')
  @ApiOperation({ summary: 'Browse the catalog index, annotated with import/update status' })
  list(@Scope() scope: ExtensionScope) {
    return this.registry.getRegistry(scope);
  }

  @Get('updates')
  @ApiOperation({ summary: 'List imported entries that have a newer version available upstream' })
  updates(@Scope() scope: ExtensionScope) {
    return this.registry.getUpdates(scope);
  }

  @Get('registry/:slug')
  @ApiOperation({ summary: 'Preview a catalog entry (validated install snippet + auth/delivery)' })
  entry(@Param('slug') slug: string) {
    return this.registry.getEntry(slug);
  }

  @Post('import')
  @ApiOperation({ summary: 'Import (or re-import with overwrite) a catalog entry into the local DB' })
  import(@Body() dto: ImportRegistryDto, @Scope() scope: ExtensionScope) {
    return this.registry.importEntry(dto.slug, dto.overwrite ?? false, scope);
  }
}
