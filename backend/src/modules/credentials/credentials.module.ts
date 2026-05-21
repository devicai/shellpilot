import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VaultEntry, VaultEntrySchema } from './schema/vault-entry.schema';
import { CredentialsRepository } from './credentials.repository';
import { CredentialsService } from './credentials.service';
import { CredentialsController } from './credentials.controller';
import { SecretCipherService } from './crypto/secret-cipher.service';
import { JitTokenService } from './jit/jit-token.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: VaultEntry.name, schema: VaultEntrySchema }])],
  controllers: [CredentialsController],
  providers: [CredentialsRepository, CredentialsService, SecretCipherService, JitTokenService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
