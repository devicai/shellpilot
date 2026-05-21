import { IsArray, IsMongoId, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IssueCredentialDto {
  @ApiProperty({ description: 'User owning the credential' })
  @IsMongoId()
  userId!: string;

  @ApiProperty({ example: 'gh' })
  @IsString()
  cli!: string;

  @ApiPropertyOptional({ type: [String], description: 'Optional command path for binding the JIT token' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  commandPath?: string[];
}
