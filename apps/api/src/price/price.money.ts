/** Round USD to 6 decimal places (microdollars). */
export function roundUsd(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function sumUsd(values: number[]): number {
  return roundUsd(values.reduce((acc, n) => acc + n, 0));
}

/** Tokens or characters × USD-per-million. */
export function amountFromPerMillion(
  quantity: number,
  usdPerMillion: number,
): number {
  if (quantity <= 0 || usdPerMillion <= 0) return 0;
  return roundUsd((quantity * usdPerMillion) / 1_000_000);
}

export function amountFromPerMinute(
  minutes: number,
  usdPerMinute: number,
): number {
  if (minutes <= 0 || usdPerMinute <= 0) return 0;
  return roundUsd(minutes * usdPerMinute);
}
