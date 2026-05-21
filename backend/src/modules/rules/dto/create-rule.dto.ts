import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Decision, DECISIONS } from '../schema/policy.schema';

export class CreateRuleDto {
  @ApiProperty({ example: 'gh' })
  @IsString()
  cli!: string;

  @ApiProperty({ example: 'repo delete *' })
  @IsString()
  path!: string;

  @ApiProperty({ enum: DECISIONS })
  @IsEnum(DECISIONS)
  effect!: Decision;

  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  priority?: number;
}
