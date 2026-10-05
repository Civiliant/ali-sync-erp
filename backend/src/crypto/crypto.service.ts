import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const CIPHER_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_PATTERN = /^(?:[\da-fA-F]{64}|[A-Za-z\d+/]{43}=?)$/;

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    const configuredKey = configService.get<string>('APP_ENCRYPTION_KEY');
    if (!configuredKey || !KEY_PATTERN.test(configuredKey)) {
      throw new Error(
        'APP_ENCRYPTION_KEY must be a 32-byte hex or base64-encoded key',
      );
    }

    this.key = /^[\da-fA-F]{64}$/.test(configuredKey)
      ? Buffer.from(configuredKey, 'hex')
      : Buffer.from(configuredKey, 'base64');
    if (this.key.length !== 32) {
      throw new Error('APP_ENCRYPTION_KEY must decode to exactly 32 bytes');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(CIPHER_ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [iv, authTag, ciphertext]
      .map((part) => part.toString('base64url'))
      .join('.');
  }

  decrypt(encryptedValue: string): string {
    const parts = encryptedValue.split('.');
    if (parts.length !== 3) {
      throw new InternalServerErrorException('Invalid encrypted value');
    }

    const [encodedIv, encodedAuthTag, encodedCiphertext] = parts;
    const iv = Buffer.from(encodedIv, 'base64url');
    const authTag = Buffer.from(encodedAuthTag, 'base64url');
    const ciphertext = Buffer.from(encodedCiphertext, 'base64url');
    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      throw new InternalServerErrorException('Invalid encrypted value');
    }

    try {
      const decipher = createDecipheriv(CIPHER_ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new InternalServerErrorException('Unable to decrypt value');
    }
  }
}
