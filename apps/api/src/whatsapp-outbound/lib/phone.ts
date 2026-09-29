const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/**
 * Normalize a phone to WhatsApp `to` digits (E.164 without `+`).
 * - `+…` / `00…` keep the given country code.
 * - A bare 10-digit national number gets `defaultCountryCode`.
 * - Otherwise digits are used as-is (already include a country code).
 * Returns null when the result is not 8–15 digits.
 */
export function normalizeWhatsAppPhone(
  raw: string,
  defaultCountryCode: string,
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (!hasPlus) {
    if (digits.startsWith('00')) {
      digits = digits.slice(2);
    } else {
      const national = digits.replace(/^0+/, '');
      if (national.length === 10) {
        digits = `${defaultCountryCode.replace(/\D/g, '')}${national}`;
      } else {
        digits = national;
      }
    }
  }

  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;
  return digits;
}
