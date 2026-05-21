import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { CONFIG } from '../../../config/config.loader';
import { ShellpilotModuleConfig } from '../../../config/config.types';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface SealedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

@Injectable()
export class SecretCipherService {
  private readonly key: Buffer;

  constructor(@Inject(CONFIG) config: ShellpilotModuleConfig) {
    const raw = config.secrets.masterKey;
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new InternalServerErrorException(
        `secrets.masterKey must decode to exactly 32 bytes (got ${key.length}). Generate with: openssl rand -base64 32`,
      );
    }
    this.key = key;
  }

  seal(plaintext: string): SealedSecret {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: enc.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    };
  }

  open(sealed: SealedSecret): string {
    const iv = Buffer.from(sealed.iv, 'base64');
    const tag = Buffer.from(sealed.tag, 'base64');
    const ciphertext = Buffer.from(sealed.ciphertext, 'base64');
    if (tag.length !== TAG_BYTES) {
      throw new InternalServerErrorException('Invalid auth tag length on stored secret');
    }
    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return dec.toString('utf8');
  }
}
