import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function otpDeliveryKey(raw: string): Buffer {
  if (!/^[a-fA-F0-9]{64}$/.test(raw))
    throw new Error('otp_delivery_key_invalid');
  return Buffer.from(raw, 'hex');
}
export function encryptOtp(
  code: string,
  key: Buffer,
  id: string,
  expiry: Date,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${id}:${expiry.toISOString()}`));
  const encrypted = Buffer.concat([
    cipher.update(code, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((b) => b.toString('base64'))
    .join('.');
}
export function decryptOtp(
  value: string,
  key: Buffer,
  id: string,
  expiry: Date,
): string {
  const [iv, tag, encrypted, extra] = value.split('.');
  if (!iv || !tag || !encrypted || extra)
    throw new Error('otp_delivery_cipher_invalid');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64'),
  );
  decipher.setAAD(Buffer.from(`${id}:${expiry.toISOString()}`));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const code = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  if (!/^\d{6}$/.test(code)) throw new Error('otp_delivery_code_invalid');
  return code;
}
