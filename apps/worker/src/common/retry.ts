export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function exponentialBackoffMs(
  failedAttemptIndex: number,
  baseMs: number,
  capMs: number,
  random: () => number = Math.random,
): number {
  const exp = baseMs * Math.pow(2, failedAttemptIndex);
  const capped = Math.min(capMs, exp);
  const jitter = capped * (0.8 + random() * 0.4);
  return Math.max(0, Math.round(jitter));
}
