import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Scope } from '../../common/decorators/scope.decorator';
import { ExtensionScope } from '../../interfaces';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'List users (admin)' })
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

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create a user (admin)' })
  create(@Body() dto: CreateUserDto, @Scope() scope: ExtensionScope) {
    return this.service.create(dto, scope);
  }

  @Get(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Get user by id (admin)' })
  findOne(@Param('id') id: string, @Scope() scope: ExtensionScope) {
    return this.service.findById(id, scope);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update user (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Scope() scope: ExtensionScope) {
    return this.service.update(id, dto, scope);
  }

  @Post(':id/change-password')
  @Roles('admin')
  @ApiOperation({ summary: 'Change a user password (admin)' })
  async changePassword(
    @Param('id') id: string,
    @Body() dto: ChangePasswordDto,
    @Scope() scope: ExtensionScope,
  ) {
    await this.service.changePassword(id, dto.newPassword, scope);
    return { status: 'ok' };
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a user (admin)' })
  async remove(@Param('id') id: string, @Scope() scope: ExtensionScope) {
    await this.service.delete(id, scope);
    return { status: 'ok' };
  }
}
