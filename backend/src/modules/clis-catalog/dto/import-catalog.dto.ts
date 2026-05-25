import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportCatalogDto {
  @ApiProperty({
    description:
      'YAML content. Either a top-level list (`- slug: ...`) or an object wrapping `clis: [...]`.',
    example: '- slug: aws\n  name: AWS CLI\n  auth:\n    mode: env-multi',
  })
  @IsString()
  content!: string;

  @ApiPropertyOptional({
    description: 'Replace existing entries when their slug matches. Defaults to false (skip duplicates).',
  })
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}
