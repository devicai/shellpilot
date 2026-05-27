import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ImportRegistryDto {
  @ApiProperty({ description: 'Slug of the catalog entry to import (must exist in the registry index).' })
  @IsString()
  slug!: string;

  @ApiProperty({
    required: false,
    default: false,
    description: 'Replace an existing local entry with the same slug instead of failing.',
  })
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}
