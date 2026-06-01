import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtOrApiKeyGuard } from '../auth/guards/jwt-or-api-key.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { ExtensionScope } from '../../interfaces';
import { ProfilesService } from './profiles.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Profiles')
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly service: ProfilesService) {}

  @ApiBearerAuth()
  @UseGuards(JwtOrApiKeyGuard)
  @Get()
  @ApiOperation({ summary: 'List profiles (JWT or API key)' })
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
  @Get(':id')
  @ApiOperation({ summary: 'Get profile by id' })
  findOne(@Param('id') id: string, @Scope() scope: ExtensionScope) {
    return this.service.findById(id, scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtOrApiKeyGuard, RolesGuard)
  @Roles('admin', 'operator')
  @Post()
  @ApiOperation({ summary: 'Create a profile (admin/operator)' })
  create(@Body() dto: CreateProfileDto, @Scope() scope: ExtensionScope) {
    return this.service.create(dto, scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtOrApiKeyGuard, RolesGuard)
  @Roles('admin', 'operator')
  @Patch(':id')
  @ApiOperation({ summary: 'Update profile (admin/operator)' })
  update(@Param('id') id: string, @Body() dto: UpdateProfileDto, @Scope() scope: ExtensionScope) {
    return this.service.update(id, dto, scope);
  }

  @ApiBearerAuth()
  @UseGuards(JwtOrApiKeyGuard, RolesGuard)
  @Roles('admin')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete profile (admin)' })
  async remove(@Param('id') id: string, @Scope() scope: ExtensionScope) {
    await this.service.delete(id, scope);
    return { status: 'ok' };
  }
}
