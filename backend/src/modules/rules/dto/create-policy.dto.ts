import { IsArray, IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Decision, DECISIONS, Enforcement, ENFORCEMENTS } from '../schema/policy.schema';

export class CreatePolicyDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional({ enum: DECISIONS, default: 'deny' })
  @IsOptional()
  @IsEnum(DECISIONS)
  defaultEffect?: Decision;

  @ApiPropertyOptional({ enum: ENFORCEMENTS, default: 'warn' })
  @IsOptional()
  @IsEnum(ENFORCEMENTS)
  enforcement?: Enforcement;

  @ApiPropertyOptional({ type: [String], example: ['gh', 'stripe'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clis?: string[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  webhooks?: Record<string, string>;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
