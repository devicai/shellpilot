import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CliEnforcement, CLI_ENFORCEMENT } from '../schema/cli.schema';

export class InstallCommandsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() mac?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linux?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() windows?: string;
}

export class CreateCliDto {
  @ApiProperty({ example: 'gh' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]*$/, { message: 'slug must be kebab-lowercase' })
  slug!: string;

  @ApiProperty({ example: 'GitHub CLI' })
  @IsString()
  name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() vendor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ example: 'GH_TOKEN' }) @IsOptional() @IsString() envVarHint?: string;

  @ApiPropertyOptional({ enum: CLI_ENFORCEMENT, default: 'warn' })
  @IsOptional()
  @IsEnum(CLI_ENFORCEMENT)
  defaultEnforcement?: CliEnforcement;

  @ApiPropertyOptional({ type: InstallCommandsDto })
  @IsOptional()
  @IsObject()
  installCommands?: InstallCommandsDto;

  @ApiPropertyOptional() @IsOptional() @IsString() docsUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
