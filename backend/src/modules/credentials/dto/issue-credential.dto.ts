import { IsArray, IsMongoId, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IssueCredentialDto {
  @ApiPropertyOptional({
    description: 'Ignored from the wrapper — identity is derived from the API key. Kept for back-compat.',
  })
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @ApiProperty({ example: 'gh' })
  @IsString()
  cli!: string;

  @ApiPropertyOptional({ type: [String], description: 'Optional command path for binding the JIT token' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  commandPath?: string[];
}
