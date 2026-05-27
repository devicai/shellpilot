import { IsArray, IsBoolean, IsEnum, IsMongoId, IsObject, IsOptional, IsString } from 'class-validator';
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

  @ApiPropertyOptional({
    type: Object,
    description:
      'Event → URL map. Known keys: on_deny, on_requires_approval, on_jit_issued, on_binary_missing.',
    example: { on_deny: 'https://hooks.slack.com/...' },
  })
  @IsOptional()
  @IsObject()
  webhooks?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Shared HMAC secret used to sign outgoing webhook bodies' })
  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    description:
      "Owner user id. Marks the policy as that user's individual rules — hidden from the global list and never the global fallback.",
  })
  @IsOptional()
  @IsMongoId()
  ownerUserId?: string;
}
