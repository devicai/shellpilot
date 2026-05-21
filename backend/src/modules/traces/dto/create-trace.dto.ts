import { IsArray, IsDateString, IsEnum, IsInt, IsMongoId, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Enforcement, ENFORCEMENTS } from '../../rules/schema/policy.schema';

// Trace decisions are a superset of policy decisions: in addition to allow /
// deny / requires-approval (the verdict the policy returned), the Go wrapper
// also reports lifecycle events (install / uninstall, missing binaries, etc.).
// Keeping these in a separate constant means the policy evaluator stays
// strictly typed against allow|deny|requires-approval while the trace ingest
// accepts the wider set the wrapper actually emits.
export const TRACE_DECISIONS = [
  'allow',
  'deny',
  'requires-approval',
  'binary-missing',
  'install',
  'uninstall',
  'install-error',
  'uninstall-error',
  'already-present',
] as const;
export type TraceDecision = (typeof TRACE_DECISIONS)[number];

export class CreateTraceDto {
  @ApiProperty({ example: 'gh' })
  @IsString()
  cli!: string;

  @ApiPropertyOptional({ type: [String], example: ['repo', 'delete'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  commandPath?: string[];

  @ApiPropertyOptional({ type: [String], example: ['repo', 'delete', 'my-repo'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  args?: string[];

  @ApiProperty({ enum: TRACE_DECISIONS })
  @IsEnum(TRACE_DECISIONS)
  decision!: TraceDecision;

  @ApiPropertyOptional({ enum: ENFORCEMENTS })
  @IsOptional()
  @IsEnum(ENFORCEMENTS)
  enforcement?: Enforcement;

  @ApiPropertyOptional() @IsOptional() @IsMongoId() matchedRuleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() matchedRulePath?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() agent?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() durationMs?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() exitCode?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() timestamp?: string;
}
