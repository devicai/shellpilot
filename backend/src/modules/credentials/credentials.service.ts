import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CredentialsRepository } from './credentials.repository';
import { SecretCipherService } from './crypto/secret-cipher.service';
import { JitTokenService } from './jit/jit-token.service';
import { VaultEntry } from './schema/vault-entry.schema';
import { StoreCredentialDto } from './dto/store-credential.dto';
import { IssueCredentialDto } from './dto/issue-credential.dto';
import { VerifyCredentialDto } from './dto/verify-credential.dto';
import { AuthenticatedUser, ExtensionScope, PaginatedResponse } from '../../interfaces';

@Injectable()
export class CredentialsService {
  constructor(
    private readonly repo: CredentialsRepository,
    private readonly cipher: SecretCipherService,
    private readonly jit: JitTokenService,
  ) {}

  async store(dto: StoreCredentialDto, actor: AuthenticatedUser, scope: ExtensionScope): Promise<VaultEntry> {
    let ownerId = actor.id;
    if (dto.userId && dto.userId !== actor.id) {
      if (actor.role !== 'admin') {
        throw new ForbiddenException('Only admins can store credentials for other users');
      }
      ownerId = dto.userId;
    }
    void scope;
    const sealed = this.cipher.seal(dto.secret);
    return this.repo.upsertForUserAndCli(
      ownerId,
      dto.cli,
      dto.envVar,
      sealed.ciphertext,
      sealed.iv,
      sealed.tag,
    );
  }

  async list(actor: AuthenticatedUser, scope: ExtensionScope, opts: { limit?: number; offset?: number }): Promise<PaginatedResponse<VaultEntry>> {
    if (actor.role === 'admin') {
      return this.repo.find({}, scope, opts);
    }
    return this.repo.find({ userId: new Types.ObjectId(actor.id) }, scope, opts);
  }

  async delete(id: string, actor: AuthenticatedUser, scope: ExtensionScope): Promise<void> {
    const existing = (await this.repo.findById(id, scope)) as (VaultEntry & { userId: Types.ObjectId }) | null;
    if (!existing) throw new NotFoundException('Credential not found');
    if (actor.role !== 'admin' && String(existing.userId) !== actor.id) {
      throw new ForbiddenException();
    }
    await this.repo.deleteById(id, scope);
  }

  async issue(dto: IssueCredentialDto): Promise<{ jitToken: string; expiresIn: number }> {
    const entry = await this.repo.findForUserAndCli(dto.userId, dto.cli);
    if (!entry) {
      throw new NotFoundException(`No credential stored for user ${dto.userId} and CLI ${dto.cli}`);
    }
    const secret = this.cipher.open({
      ciphertext: entry.secretCiphertext,
      iv: entry.secretIv,
      tag: entry.secretTag,
    });
    return this.jit.issue({
      userId: dto.userId,
      cli: dto.cli,
      envVar: entry.envVar,
      secret,
      commandPath: dto.commandPath,
    });
  }

  async verify(dto: VerifyCredentialDto): Promise<{ envVar: string; secret: string; cli: string; userId: string }> {
    const payload = await this.jit.consume(dto.jitToken);
    if (!payload) {
      throw new NotFoundException('JIT token not found or already consumed');
    }
    if (dto.expectedCommandPath && payload.commandPath) {
      const expected = dto.expectedCommandPath.join(' ');
      const stored = payload.commandPath.join(' ');
      if (expected !== stored) {
        throw new ForbiddenException('Command path mismatch for JIT token');
      }
    }
    return { envVar: payload.envVar, secret: payload.secret, cli: payload.cli, userId: payload.userId };
  }
}
