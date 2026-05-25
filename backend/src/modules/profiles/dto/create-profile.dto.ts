import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsMongoId, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProfileCredentialDto {
  @IsString()
  cli!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class CreateProfileDto {
  @ApiProperty({ example: 'devops' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String], example: ['gh', 'gcloud', 'kubectl'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clis?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  policyId?: string;

  @ApiPropertyOptional({
    description: 'Shared credentials provisioned for every user with this profile',
    type: [ProfileCredentialDto],
  })
  @IsOptional()
  @IsArray()
  @Type(() => ProfileCredentialDto)
  defaultCredentials?: ProfileCredentialDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
