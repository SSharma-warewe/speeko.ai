import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_CODE_TTL_MS = 5 * 60 * 1000;
export const OTP_VERIFICATION_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export function hmacSha256(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

export function hashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Six-digit code. Not a secret in the message the user receives; never persist or return it. */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function generateVerificationToken(): string {
  return randomBytes(32).toString('base64url');
}
