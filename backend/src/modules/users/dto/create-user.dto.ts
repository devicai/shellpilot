import { IsBoolean, IsEmail, IsEnum, IsMongoId, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
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

  // Empty string is the UI's way of clearing a previously-assigned reference;
  // @IsOptional alone only skips validation for null/undefined, not '', so we
  // also short-circuit IsMongoId when the value is empty (the service treats
  // empty/null the same: unset the field).
  @ApiPropertyOptional({ description: 'Policy assigned directly to this user (takes precedence over the profile policy)' })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== '' && value !== null)
  @IsMongoId()
  policyId?: string;

  @ApiPropertyOptional({ description: 'Profile (department template) assigned to this user' })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== '' && value !== null)
  @IsMongoId()
  profileId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
