import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VaultEntry, VaultEntrySchema } from './schema/vault-entry.schema';
import { CredentialsRepository } from './credentials.repository';
import { CredentialsService } from './credentials.service';
import { CredentialsController } from './credentials.controller';
import { SecretCipherService } from './crypto/secret-cipher.service';
import { JitTokenService } from './jit/jit-token.service';
import { ClisModule } from '../clis-catalog/clis.module';
import { PostProcessService } from './post-process/post-process.service';
import { TracesModule } from '../traces/traces.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { RulesModule } from '../rules/rules.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: VaultEntry.name, schema: VaultEntrySchema }]),
    ClisModule,
    TracesModule,
    ProfilesModule,
    // Exposes PolicyEvaluatorService so issuance can re-evaluate the command's
    // rule server-side (RulesModule does not import CredentialsModule — no cycle).
    RulesModule,
  ],
  controllers: [CredentialsController],
  providers: [
    CredentialsRepository,
    CredentialsService,
    SecretCipherService,
    JitTokenService,
    PostProcessService,
  ],
  exports: [CredentialsService],
})
export class CredentialsModule {}
