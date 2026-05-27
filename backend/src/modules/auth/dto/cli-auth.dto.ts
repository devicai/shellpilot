import { IsMongoId, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Case 1 — admin provisions a service account by id or email. */
export class ProvisionDto {
  @ApiProperty({ description: 'Service account id or email', example: 'agent@devic.ai' })
  @IsString()
  serviceAccount!: string;

  @ApiPropertyOptional({ description: 'Name for the issued key (defaults to cli-provision-<date>)' })
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
