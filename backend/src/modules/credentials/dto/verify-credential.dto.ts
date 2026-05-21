import { IsArray, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyCredentialDto {
  @ApiProperty({ example: 'jit_<uuid>' })
  @IsString()
  jitToken!: string;

  @ApiPropertyOptional({ type: [String], description: 'If provided, must match the command path bound at issue time' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  expectedCommandPath?: string[];
}
