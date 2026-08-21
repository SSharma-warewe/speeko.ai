/** LiveKit WebRTC / SIP / agent-session minimum increment. */
export const ROOM_MIN_SECONDS = 10;

/** LiveKit Inference STT minimum increment. */
export const STT_MIN_SECONDS = 1;

export function parseTimestamp(
  value: Date | string | number | null | undefined,
): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Session clock: answered→ended, else started→ended, else dialStarted→ended.
 * Returns null when the range cannot be computed.
 */
export function sessionDurationMs(input: {
  answeredAt?: Date | string | number | null;
  startedAt?: Date | string | number | null;
  endedAt?: Date | string | number | null;
  dialStartedAt?: Date | string | number | null;
}): number | null {
  const ended = parseTimestamp(input.endedAt);
  if (!ended) return null;
  const start =
    parseTimestamp(input.answeredAt) ??
    parseTimestamp(input.startedAt) ??
    parseTimestamp(input.dialStartedAt);
  if (!start) return null;
  return Math.max(0, ended.getTime() - start.getTime());
}

/**
 * Convert a duration to billed minutes.
 * LiveKit rounds each resource up to `minSeconds` before summing.
 * Missing duration → 0 (do not invent a session).
 */
export function billedMinutesFromMs(
  durationMs: number | null | undefined,
  minSeconds: number,
): number {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) {
    return 0;
  }
  const seconds = Math.max(minSeconds, Math.ceil(durationMs / 1000) || 0);
  if (seconds <= 0) return 0;
  return seconds / 60;
}
