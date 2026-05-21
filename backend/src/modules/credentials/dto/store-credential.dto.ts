import { IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StoreCredentialDto {
  @ApiPropertyOptional({ description: 'User owning the credential (admins only; defaults to current user)' })
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @ApiProperty({ example: 'gh' })
  @IsString()
  cli!: string;

  @ApiProperty({ example: 'GH_TOKEN' })
  @IsString()
  envVar!: string;

  @ApiProperty({ description: 'Plaintext secret; encrypted server-side with AES-256-GCM' })
  @IsString()
  @MinLength(1)
  secret!: string;
}
