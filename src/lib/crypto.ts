import 'server-only';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { env } from './env';

const VERSION = 'v1';

function masterKey(): Buffer {
  const key = Buffer.from(env.masterKey, 'base64');
  if (key.length !== 32) {
    throw new Error('MASTER_ENCRYPTION_KEY must decode to exactly 32 bytes (base64). Run: npm run gen:key');
  }
  return key;
}

/**
 * AES-256-GCM. `aad` (we use the user's id) is authenticated but not secret, so a
 * ciphertext copied to another user's row fails to decrypt.
 * Format: v1.<iv>.<tag>.<ciphertext>  (base64url)
 */
export function encryptSecret(plaintext: string, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptSecret(payload: string, aad: string): string {
  const [version, iv, tag, ct] = payload.split('.');
  if (version !== VERSION || !iv || !tag || !ct) throw new Error('Unsupported ciphertext format');
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

/** Keyed hash for log pseudonymisation (e.g. IP addresses). */
export function hmacHex(label: string, value: string): string {
  return createHmac('sha256', masterKey()).update(`${label}:${value}`).digest('hex');
}
