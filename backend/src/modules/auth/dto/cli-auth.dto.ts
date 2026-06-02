import { IsMongoId, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Case 1 — admin provisions a service account by id or email. */
export class ProvisionDto {
  @ApiProperty({ description: 'Service account id or email', example: 'agent@example.com' })
  @IsString()
  serviceAccount!: string;

  @ApiPropertyOptional({ description: 'Name for the issued key (defaults to cli-provision-<date>)' })
  @IsOptional()
  @IsString()
  name?: string;
}

/**
 * Ensure-and-provision a service account by its external entity id. Creates the
 * service-account user on first call (keyed by externalUserId within the tenant),
 * then mints an API key for it.
 */
export class ProvisionServiceAccountDto {
  @ApiProperty({
    description: 'Stable id of the consuming entity; becomes the service account externalUserId',
    example: 'entity-7f3a9c',
  })
  @IsString()
  externalUserId!: string;

  @ApiPropertyOptional({ description: 'Display name / issued key name for the service account' })
  @IsOptional()
  @IsString()
  name?: string;
}

/** Case 2 — browser login: the authenticated user mints a key for themselves. */
export class MintCliKeyDto {
  @ApiPropertyOptional({ description: 'Name for the issued key (defaults to cli-login-<date>)' })
  @IsOptional()
  @IsString()
  name?: string;
}

/** Case 3a — admin generates an enrollment token for a user. */
export class GenerateEnrollmentDto {
  @ApiProperty({ description: 'User the enrollment file will authenticate as' })
  @IsMongoId()
  userId!: string;
}

/** Case 3b — redeem an enrollment token for a real API key. */
export class EnrollDto {
  @ApiProperty({ description: 'Single-use enrollment token from the credentials file' })
  @IsString()
  enrollToken!: string;
}
