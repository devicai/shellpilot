import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CLI_AUTH_MODES,
  CLI_ENFORCEMENT,
  CLI_FILE_FORMATS,
  CliAuthMode,
  CliEnforcement,
  CliFileFormat,
} from '../schema/cli.schema';

export class InstallCommandsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() mac?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linux?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() windows?: string;
}

export class CliAuthDto {
  @ApiProperty({ enum: CLI_AUTH_MODES })
  @IsEnum(CLI_AUTH_MODES)
  mode!: CliAuthMode;

  @ApiPropertyOptional({ description: 'Env var name. Required when mode = "env".' })
  @IsOptional()
  @IsString()
  envVar?: string;

  @ApiPropertyOptional({
    description: 'Env var names. Required when mode = "env-multi".',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  envVars?: string[];

  @ApiPropertyOptional({
    description:
      'Target file path. String for same-on-all-OS, or { mac, linux, windows } for per-OS overrides. Required when mode = "file".',
  })
  @IsOptional()
  @Type(() => Object)
  filePath?: string | { mac?: string; linux?: string; windows?: string };

  @ApiPropertyOptional({ enum: CLI_FILE_FORMATS })
  @IsOptional()
  @IsEnum(CLI_FILE_FORMATS)
  fileFormat?: CliFileFormat;

  @ApiPropertyOptional({ description: 'CLI flag name. Required when mode = "flag".' })
  @IsOptional()
  @IsString()
  flag?: string;

  @ApiPropertyOptional({
    description: 'Interactive login command. Required when mode = "login-command".',
  })
  @IsOptional()
  @IsString()
  loginCommand?: string;

  @ApiPropertyOptional({
    description:
      'Optional server-side enrichment steps run at /credentials/verify (e.g. OAuth refresh exchange). See Auth post-processing docs.',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  @IsOptional()
  @IsArray()
  @Type(() => Object)
  postProcess?: Record<string, unknown>[];

  @ApiPropertyOptional({
    description:
      'Optional client-side delivery steps applied by the wrapper before exec (e.g. write file, set env var). See Auth delivery docs.',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  @IsOptional()
  @IsArray()
  @Type(() => Object)
  delivery?: Record<string, unknown>[];
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

  @ApiPropertyOptional({ type: CliAuthDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CliAuthDto)
  auth?: CliAuthDto;

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
  @ApiPropertyOptional({ description: 'Public URL of the CLI logo (PNG/SVG).' })
  @IsOptional()
  @IsString()
  iconUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
