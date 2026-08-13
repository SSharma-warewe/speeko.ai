/** Default GHL slot length for this location (live calendar: 30 mins). */
export const GHL_SLOT_MINUTES = 30;
export const GHL_FREE_SLOT_CAP = 12;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const OFFSET = /([+-])(\d{2}):(\d{2})$/;

/** Accept unix seconds (number or numeric string) or ISO-8601. */
export function parseTimeToUnix(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{9,12}$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

export function unixToIso(unix: number): string {
  return new Date(unix * 1000).toISOString();
}

/** Reject windows that ended more than 24h ago (wrong-year LLM args). */
export function pastWindowError(
  start: number,
  end: number,
): { ok: false; error: string; message: string } | null {
  const nowSec = Math.floor(Date.now() / 1000);
  const grace = 24 * 60 * 60;
  if (end >= nowSec - grace) {
    return null;
  }
  return {
    ok: false,
    error: 'window_in_past',
    message:
      `The requested window ends in the past (start=${unixToIso(start)}, end=${unixToIso(end)}). ` +
      `Current UTC time is ${new Date().toISOString()}. ` +
      `Re-resolve “today/tomorrow” from the authoritative call clock and call again with correct year/month/day. Do not invent free times.`,
  };
}

export function addMinutesKeepingOffset(
  iso: string,
  minutes: number,
): string {
  const startMs = Date.parse(iso);
  if (Number.isNaN(startMs)) return iso;
  const endMs = startMs + minutes * 60_000;
  const m = iso.match(OFFSET);
  if (!m) {
    return new Date(endMs).toISOString();
  }
  const sign = m[1] === '-' ? -1 : 1;
  const offsetMin = sign * (Number(m[2]) * 60 + Number(m[3]));
  const local = new Date(endMs + offsetMin * 60_000);
  return `${utcStamp(local)}${m[1]}${m[2]}:${m[3]}`;
}

/**
 * Map live GHL free-slots body to open starts only.
 * Live shape: { "YYYY-MM-DD": { slots: string[] }, traceId }.
 * Drops traceId and any non-date / non-string fields (titles, events).
 */
export function mapGhlFreeSlots(
  json: Record<string, unknown> | null,
  slotMinutes = GHL_SLOT_MINUTES,
  cap = GHL_FREE_SLOT_CAP,
): { startIso: string; endIso: string }[] {
  if (!json) return [];
  const dateKeys = Object.keys(json)
    .filter((k) => DATE_KEY.test(k))
    .sort();
  const out: { startIso: string; endIso: string }[] = [];
  for (const key of dateKeys) {
    const raw = json[key];
    const starts = extractSlotStarts(raw);
    for (const startIso of starts) {
      out.push({
        startIso,
        endIso: addMinutesKeepingOffset(startIso, slotMinutes),
      });
      if (out.length >= cap) return out;
    }
  }
  return out;
}

function extractSlotStarts(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const slots = (raw as { slots?: unknown }).slots;
  if (!Array.isArray(slots)) return [];
  return slots.filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0,
  );
}

function utcStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
