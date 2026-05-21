import { IsArray, IsDateString, IsOptional, IsString, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'wrapper-laptop-pablo' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Owner user id (admin can specify; defaults to current user)' })
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @ApiPropertyOptional({ type: [String], example: ['rules:read', 'credentials:issue', 'traces:write'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
