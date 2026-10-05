import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { CryptoService } from './crypto.service.js';

describe('CryptoService', () => {
  const key = randomBytes(32).toString('hex');
  const service = new CryptoService({
    get: () => key,
  } as unknown as ConfigService);

  it('encrypts and decrypts values with AES-256-GCM', () => {
    const plaintext = randomBytes(48).toString('base64url');
    const encrypted = service.encrypt(plaintext);

    expect(encrypted).not.toContain(plaintext);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = service.encrypt(randomBytes(24).toString('hex'));
    const [iv, authTag, ciphertext] = encrypted.split('.');
    const altered = `${iv}.${authTag}.${ciphertext.slice(0, -1)}0`;

    expect(() => service.decrypt(altered)).toThrow();
  });

  it('rejects an invalid key without exposing it', () => {
    const invalidKey = randomBytes(12).toString('hex');
    expect(
      () =>
        new CryptoService({
          get: () => invalidKey,
        } as unknown as ConfigService),
    ).toThrow('APP_ENCRYPTION_KEY must be a 32-byte hex or base64-encoded key');
  });

  it('rejects the documented all-zero placeholder key', () => {
    expect(
      () =>
        new CryptoService({
          get: () => '0'.repeat(64),
        } as unknown as ConfigService),
    ).toThrow('APP_ENCRYPTION_KEY must be replaced with a random key');
  });
});
