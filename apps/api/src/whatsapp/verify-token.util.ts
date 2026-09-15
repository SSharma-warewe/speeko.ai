import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_PREFIX = 'wa_';

/** Generate a new Meta verify token (return full secret once; store only hash). */
export function generateVerifyToken(): {
  verifyToken: string;
  verifyTokenPrefix: string;
  verifyTokenHash: string;
} {
  const secret = randomBytes(32).toString('base64url');
  const verifyToken = `${TOKEN_PREFIX}${secret}`;
  return {
    verifyToken,
    verifyTokenPrefix: verifyTokenPrefixFrom(verifyToken),
    verifyTokenHash: hashVerifyToken(verifyToken),
  };
}

export function hashVerifyToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time compare of provided token against stored SHA-256 hex. */
export function verifyTokenMatches(
  token: string,
  tokenHash: string,
): boolean {
  if (!token || !tokenHash || tokenHash.length !== 64) {
    return false;
  }
  const provided = Buffer.from(hashVerifyToken(token), 'utf8');
  const expected = Buffer.from(tokenHash, 'utf8');
  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}

export function verifyTokenPrefixFrom(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length <= 8) return trimmed.slice(0, 4) + '…';
  return trimmed.slice(0, 8) + '…';
}
