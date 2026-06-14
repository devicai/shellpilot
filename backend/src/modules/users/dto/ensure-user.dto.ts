import { IsEmail, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Find-or-create a passwordless human user keyed by their external identity
 * `(scope, externalUserId)`. Lets an admin pre-configure a user (profile,
 * policy, rules) before that user has connected from their terminal. Idempotent:
 * a repeat call returns the same user, refreshing the mirrored email/name.
 */
export class EnsureUserDto {
  @ApiProperty({
    description: 'Stable id of the external identity; becomes the user externalUserId',
    example: 'ext-7f3a9c',
  })
  @IsString()
  externalUserId!: string;

  @ApiPropertyOptional({ description: 'Mirrored email from the identity provider' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Mirrored display name from the identity provider' })
  @IsOptional()
  @IsString()
  name?: string;
}
