import { IsMongoId, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Discriminated payload shape — the actual shape depends on the CLI's
// `auth.mode` in Mongo, so we can only enforce the union at runtime
// (CredentialsService.normalizeEnvelope). The types here document the contract
// for TypeScript consumers and the OpenAPI schema; the runtime rejects extra
// keys (rejectUnknownKeys) so a payload built for the wrong mode never
// silently succeeds.
//
//   mode=env  | flag → { secret: string }
//   mode=env-multi   → { values: Record<string, string> }
//   mode=file        → { content: string }
//
// login-command / none never reach this endpoint.
export type StoreCredentialPayload =
  | { secret: string }
  | { values: Record<string, string> }
  | { content: string };

export class StoreCredentialDto {
  @ApiPropertyOptional({
    description: 'User owning the credential (admins only; defaults to current user)',
  })
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @ApiProperty({ example: 'gh' })
  @IsString()
  cli!: string;

  @ApiProperty({
    description:
      'Mode-dependent envelope. Allowed shapes: {secret} (env/flag) | {values} (env-multi) | {content} (file). Extra keys are rejected.',
    oneOf: [
      { type: 'object', required: ['secret'], properties: { secret: { type: 'string' } } },
      {
        type: 'object',
        required: ['values'],
        properties: { values: { type: 'object', additionalProperties: { type: 'string' } } },
      },
      { type: 'object', required: ['content'], properties: { content: { type: 'string' } } },
    ],
  })
  @IsObject()
  payload!: StoreCredentialPayload;
}
