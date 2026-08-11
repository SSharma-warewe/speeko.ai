import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const KEY_PREFIX = 'ca_live_';

/** Generate a new integration API key (return full secret once; store only hash). */
export function generateApiKey(): { apiKey: string; keyPrefix: string; keyHash: string } {
  const secret = randomBytes(32).toString('base64url');
  const apiKey = `${KEY_PREFIX}${secret}`;
  return {
    apiKey,
    keyPrefix: apiKey.slice(0, 16),
    keyHash: hashApiKey(apiKey),
  };
}

export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey, 'utf8').digest('hex');
}

/** Constant-time compare of provided key against stored SHA-256 hex. */
export function verifyApiKey(apiKey: string, keyHash: string): boolean {
  if (!apiKey || !keyHash || keyHash.length !== 64) {
    return false;
  }
  const provided = Buffer.from(hashApiKey(apiKey), 'utf8');
  const expected = Buffer.from(keyHash, 'utf8');
  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}

/** Opaque public URL id (URL-safe, not sequential). */
export function generatePublicId(): string {
  return randomBytes(12).toString('base64url');
}
