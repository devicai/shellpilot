import { IsBoolean, IsEmail, IsEnum, IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, USER_ROLES, UserType, USER_TYPES } from '../schema/user.schema';

export class CreateUserDto {
  @ApiProperty({ example: 'admin@shellpilot.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ enum: USER_ROLES, default: 'viewer' })
  @IsOptional()
  @IsEnum(USER_ROLES)
  role?: UserRole;

  @ApiPropertyOptional({ enum: USER_TYPES, default: 'human', description: "'service' for agents/automations" })
  @IsOptional()
  @IsEnum(USER_TYPES)
  type?: UserType;

  @ApiPropertyOptional({ description: 'Policy assigned directly to this user (takes precedence over the profile policy)' })
  @IsOptional()
  @IsMongoId()
  policyId?: string;

  @ApiPropertyOptional({ description: 'Profile (department template) assigned to this user' })
  @IsOptional()
  @IsMongoId()
  profileId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
