import { IsArray, IsOptional, IsString, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EvaluateDto {
  @ApiProperty({ example: 'gh' })
  @IsString()
  cli!: string;

  @ApiProperty({ type: [String], example: ['repo', 'delete', 'my-repo'] })
  @IsArray()
  @IsString({ each: true })
  args!: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() userId?: string;
  @ApiPropertyOptional({ description: 'Optional policy id; default: the active policy' })
  @IsOptional()
  @IsMongoId()
  policyId?: string;
}
