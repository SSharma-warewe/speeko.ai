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
