import { BadRequestException } from '@nestjs/common';

export function normalizePhone(
  raw: string,
  defaultCountryCode = '91',
): string {
  const cleaned = raw.replace(/[\s()-]/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  const digits = cleaned.replace(/^\+/, '').replace(/^0+/, '');
  return `+${defaultCountryCode}${digits}`;
}

export function pickFromNumber(
  numbers: string[] | null | undefined,
  defaultCountryCode = '91',
): string | null {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return null;
  }
  const first = numbers.find((n) => typeof n === 'string' && n.trim());
  if (!first) {
    return null;
  }
  return normalizePhone(first.trim(), defaultCountryCode);
}

/**
 * Optional LiveKit outbound region pin (lowercase ISO 3166-1 alpha-2).
 * Do not auto-apply on +91 dials — Frejun allowlists US LiveKit SIP IPs,
 * so `in` blackholes the INVITE. Keep this for an explicit trunk DTO.
 */
export function destinationCountryFromE164(
  phone: string | null | undefined,
): string | null {
  if (!phone) {
    return null;
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length >= 12) {
    return 'in';
  }
  return null;
}

/** LiveKit destination_country is lowercase (`in`, `us`). */
export function canonicalizeDestinationCountry(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length === 2 ? trimmed : null;
}

export function resolveToNumber(
  dto: { toNumber?: string | null; context?: Record<string, unknown> | null },
  defaultCountryCode = '91',
): string {
  const raw =
    dto.toNumber?.trim() ||
    (typeof dto.context?.phoneNumber === 'string'
      ? dto.context.phoneNumber.trim()
      : '') ||
    (typeof dto.context?.toNumber === 'string'
      ? dto.context.toNumber.trim()
      : '');

  if (!raw) {
    throw new BadRequestException(
      'Provide toNumber or context.phoneNumber for outbound dial',
    );
  }
  return normalizePhone(raw, defaultCountryCode);
}
