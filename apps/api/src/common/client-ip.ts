import { Request } from 'express';

/**
 * Client IP behind Railway / reverse proxies.
 * Relies on Express `trust proxy` so forged X-Forwarded-For is not blindly trusted
 * beyond the first hop the proxy sets.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
