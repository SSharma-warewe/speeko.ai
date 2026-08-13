/** Default GHL slot length for this location (live calendar: 30 mins). */
export const GHL_SLOT_MINUTES = 30;
export const GHL_FREE_SLOT_CAP = 12;
/** Free-slot windows shorter than this expand to the local calendar day(s). */
export const GHL_SHORT_WINDOW_SECONDS = 4 * 60 * 60;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const OFFSET = /([+-])(\d{2}):(\d{2})$/;
const NUMERIC_OFFSET = /[+-]\d{2}:?\d{2}$/;
const ISO_PARTS =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i;

/** True when the ISO string carries a numeric offset (not Z). */
export function hasNumericUtcOffset(value: string): boolean {
  const trimmed = value.trim();
  if (/Z$/i.test(trimmed)) return false;
  return NUMERIC_OFFSET.test(trimmed);
}

/** Accept unix seconds (number or numeric string) or ISO-8601.
 *  Naive / Z ISO + IANA timezone → wall-clock in that zone (LLM often tags local times with Z).
 *  Numeric offset is always honored. Unix seconds stay absolute.
 */
export function parseTimeToUnix(value: string, timeZone?: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{9,12}$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  const tz = timeZone?.trim();
  if (tz && isValidIanaTimeZone(tz) && !hasNumericUtcOffset(trimmed)) {
    const wall = parseIsoWallParts(trimmed);
    if (wall) return wallTimeInZoneToUnix(wall, tz);
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

/** Expand a short search window to the local calendar day(s) it touches. */
export function expandShortWindowToLocalDays(
  startSec: number,
  endSec: number,
  timeZone?: string,
  minSeconds = GHL_SHORT_WINDOW_SECONDS,
): { startSec: number; endSec: number; expanded: boolean } {
  if (endSec - startSec >= minSeconds) {
    return { startSec, endSec, expanded: false };
  }
  const tz =
    timeZone?.trim() && isValidIanaTimeZone(timeZone.trim())
      ? timeZone.trim()
      : 'UTC';
  const startDay = localYmd(startSec * 1000, tz);
  const endAnchorMs = endSec > startSec ? (endSec - 1) * 1000 : startSec * 1000;
  const endDay = localYmd(endAnchorMs, tz);
  const dayStart = wallTimeInZoneToUnix({ ...startDay, hour: 0, minute: 0, second: 0 }, tz);
  const nextMidnight = wallTimeInZoneToUnix(
    addOneCalendarDay(endDay),
    tz,
  );
  if (dayStart == null || nextMidnight == null) {
    return { startSec, endSec, expanded: false };
  }
  return { startSec: dayStart, endSec: nextMidnight, expanded: true };
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

type WallParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseIsoWallParts(value: string): WallParts | null {
  const m = ISO_PARTS.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] ? Number(m[6]) : 0;
  if (
    ![year, month, day, hour, minute, second].every((n) => Number.isFinite(n))
  ) {
    return null;
  }
  return { year, month, day, hour, minute, second };
}

export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

function localTimeParts(
  date: Date,
  timeZone: string,
): WallParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function localYmd(
  ms: number,
  timeZone: string,
): { year: number; month: number; day: number } {
  const p = localTimeParts(new Date(ms), timeZone);
  return { year: p.year, month: p.month, day: p.day };
}

function addOneCalendarDay(day: {
  year: number;
  month: number;
  day: number;
}): WallParts {
  const next = new Date(Date.UTC(day.year, day.month - 1, day.day + 1, 0, 0, 0));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
  };
}

/** Convert a wall-clock timestamp in `timeZone` to unix seconds. */
export function wallTimeInZoneToUnix(wall: WallParts, timeZone: string): number | null {
  let guess = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    0,
  );
  for (let i = 0; i < 3; i++) {
    const parts = localTimeParts(new Date(guess), timeZone);
    const localAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      0,
    );
    const desired = Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second,
      0,
    );
    const delta = desired - localAsUtc;
    if (delta === 0) break;
    guess += delta;
  }
  if (!Number.isFinite(guess)) return null;
  return Math.floor(guess / 1000);
}
