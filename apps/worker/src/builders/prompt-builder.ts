import { isRealtimeLlmModel } from '@call-agent/contracts';
import type { AgentJobMetadata } from '../job-metadata.js';
import {
  contextField,
  displayNameFromContext,
  formatContextForInstructions,
} from '../tasks/context-format.js';

/**
 * Build full parent-agent instructions for LiveKit.
 *
 * Composition (portal only edits the first block):
 * 1. Org/template **persona** systemPrompt from job metadata (editable in portal)
 * 2. **Platform runtime layer** (not in portal) — voice rules, direction, safety,
 *    and a fresh wall-clock date/time/day so calendar tools can resolve “tomorrow”, etc.
 *
 * Workflow objectives still belong in LiveKit Tasks, not here.
 */
export function buildPersonaPrompt(meta: AgentJobMetadata): string {
  const parts = [
    meta.prompt.systemPrompt.trim(),
    'You are on a live phone-style voice call. Keep spoken replies concise and natural.',
    `Call direction: ${meta.direction} (agent key: ${meta.agentKey}).`,
    buildCurrentTimeBlock(meta),
    'Follow your persona and company rules at all times.',
    'Do not invent facts that were not provided in context or tools.',
    'If the person clearly wants to end the call (goodbye, not interested, stop calling), use the end_call tool promptly.',
  ];
  return parts.filter(Boolean).join('\n\n');
}

/**
 * LiveKit `AgentTask.run()` replaces the parent agent. Copy persona into the
 * task system prompt so company facts survive the handoff. Keep parent
 * history `excludeInstructions: true` so this is not duplicated.
 */
export function composeTaskInstructions(
  meta: AgentJobMetadata,
  workflow: string,
): string {
  const persona = buildPersonaPrompt(meta);
  const trimmed = workflow.trim();
  if (!trimmed) {
    return persona;
  }
  return [
    persona,
    '=== WORKFLOW (this call) ===',
    trimmed,
    'Persona and company facts above stay in force. Do not contradict them. Workflow is the objective for this call, not a new identity.',
  ].join('\n\n');
}

export type CallClockSnapshot = {
  timeZone: string;
  now: Date;
  today: FormattedDay;
  tomorrow: FormattedDay;
  /** Today plus the next 6 local calendar days (weekday → ymd). */
  week: FormattedDay[];
  localTime: string;
  utcIso: string;
};

export type FormattedDay = {
  weekday: string;
  longDate: string;
  ymd: string;
};

/**
 * Inject live clock at job start (worker wall clock).
 * Not stored in the portal prompt — recomputed every call so “today” stays correct.
 */
export function buildCurrentTimeBlock(meta: AgentJobMetadata): string {
  const clock = snapshotCallClock(meta);
  return formatClockBlock(clock);
}

export function formatClockBlock(clock: CallClockSnapshot): string {
  return [
    '=== AUTHORITATIVE CLOCK (do not invent dates or years) ===',
    `Timezone for this call: ${clock.timeZone}`,
    `Right now (local): ${clock.today.weekday}, ${clock.today.longDate} at ${clock.localTime}`,
    `Today: ${clock.today.weekday} ${clock.today.longDate} (${clock.today.ymd})`,
    `Tomorrow: ${clock.tomorrow.weekday} ${clock.tomorrow.longDate} (${clock.tomorrow.ymd})`,
    `Next 7 days: ${formatWeekMap(clock.week)}`,
    `UTC now: ${clock.utcIso}`,
    'Rules:',
    '- When the caller says “today”, “tomorrow”, “this afternoon”, “next Monday”, resolve using THIS clock only.',
    '- Never use a different calendar year or month than shown above (models often hallucinate 2023–2025 — that is wrong if today is different).',
    '- For local spoken times, pass a timezone-naive ISO (no Z) plus timezone. Z means UTC — do not append Z to a local wall-clock.',
    `- Example: “tomorrow at 3pm” in ${clock.timeZone} is ${clock.tomorrow.ymd}T15:00:00 with timezone=${clock.timeZone}, NOT ${clock.tomorrow.ymd}T15:00:00Z.`,
    '=== END CLOCK ===',
  ].join('\n');
}

/** Compact suffix for tool descriptions (same call clock). */
export function buildToolClockHint(meta: AgentJobMetadata): string {
  const clock = snapshotCallClock(meta);
  return [
    `Authoritative clock for this call: timezone=${clock.timeZone}; today=${clock.today.ymd} (${clock.today.weekday}); tomorrow=${clock.tomorrow.ymd}; week=${formatWeekMap(clock.week)}; now_local=${clock.localTime}; utc=${clock.utcIso}.`,
    `Resolve “today/tomorrow/Monday” only with these ymd values. Do not invent years (e.g. do not use 2025 if today is ${clock.today.ymd.slice(0, 4)}).`,
    `For local times pass YYYY-MM-DDTHH:mm:ss WITHOUT Z plus timezone=${clock.timeZone}. Never append Z to a local wall-clock.`,
  ].join(' ');
}

export function snapshotCallClock(
  meta: AgentJobMetadata,
  now: Date = new Date(),
): CallClockSnapshot {
  const timeZone = resolveCallTimezone(meta);
  const today = formatDayInTimeZone(now, timeZone);
  const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  // Prefer calendar-day tomorrow in local TZ rather than +24h near DST; +24h is close enough for voice.
  const tomorrow = formatDayInTimeZone(addLocalCalendarDays(now, timeZone, 1), timeZone);
  const week = Array.from({ length: 7 }, (_, i) =>
    formatDayInTimeZone(addLocalCalendarDays(now, timeZone, i), timeZone),
  );
  const localTime = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(now);
  void tomorrowDate;
  return {
    timeZone,
    now,
    today,
    tomorrow,
    week,
    localTime,
    utcIso: now.toISOString(),
  };
}

function formatWeekMap(week: FormattedDay[]): string {
  return week.map((d) => `${d.weekday}=${d.ymd}`).join(', ');
}

/**
 * Prefer call context timezone; else E.164 phone country heuristic; else UTC.
 */
export function resolveCallTimezone(meta: AgentJobMetadata): string {
  const fromContext = contextField(
    meta.context,
    'timezone',
    'timeZone',
    'tz',
    'customerTimezone',
    'customer_timezone',
  );
  if (fromContext && isLikelyIanaTimeZone(fromContext)) {
    return fromContext.trim();
  }

  const phone =
    contextField(
      meta.context,
      'phoneNumber',
      'toNumber',
      'phone',
      'mobile',
    ) ||
    meta.participantIdentity ||
    '';
  const fromPhone = timezoneFromE164(phone);
  if (fromPhone) return fromPhone;

  return 'UTC';
}

/** Best-effort country code → IANA (not full libphonenumber). */
export function timezoneFromE164(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  const withPlus = digits.startsWith('+') ? digits : digits ? `+${digits}` : '';
  if (!withPlus.startsWith('+') || withPlus.length < 8) return null;

  // Longest-prefix match among common dial codes used by Speeko callers.
  const prefixes: Array<[string, string]> = [
    ['+91', 'Asia/Kolkata'],
    ['+44', 'Europe/London'],
    ['+61', 'Australia/Sydney'],
    ['+65', 'Asia/Singapore'],
    ['+971', 'Asia/Dubai'],
    ['+81', 'Asia/Tokyo'],
    ['+49', 'Europe/Berlin'],
    ['+33', 'Europe/Paris'],
    ['+34', 'Europe/Madrid'],
    ['+39', 'Europe/Rome'],
    ['+31', 'Europe/Amsterdam'],
    ['+353', 'Europe/Dublin'],
    ['+1', 'America/New_York'], // US/CA default; not perfect for all NANP
  ];
  for (const [prefix, tz] of prefixes) {
    if (withPlus.startsWith(prefix)) return tz;
  }
  return null;
}

function isLikelyIanaTimeZone(value: string): boolean {
  const v = value.trim();
  if (!v || v.length > 80) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: v });
    return true;
  } catch {
    return false;
  }
}

export type FormattedClock = {
  timeZone: string;
  weekday: string;
  date: string;
  time: string;
  utcIso: string;
};

/** @deprecated prefer snapshotCallClock / formatDayInTimeZone */
export function formatClockInTimeZone(now: Date, timeZone: string): FormattedClock {
  const day = formatDayInTimeZone(now, timeZone);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(now);
  return {
    timeZone: day.timeZone,
    weekday: day.weekday,
    date: day.longDate,
    time,
    utcIso: now.toISOString(),
  };
}

function formatDayInTimeZone(now: Date, timeZone: string): FormattedDay & { timeZone: string } {
  let tz = timeZone;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
  } catch {
    tz = 'UTC';
  }
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
  }).format(now);
  const longDate = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now);
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // en-CA → YYYY-MM-DD
  return { timeZone: tz, weekday, longDate, ymd };
}

/** Add N calendar days in the given IANA zone (handles DST better than raw +24h). */
function addLocalCalendarDays(now: Date, timeZone: string, days: number): Date {
  const ymd = formatDayInTimeZone(now, timeZone).ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  // Noon UTC anchor then shift calendar day — good enough for “tomorrow” labels.
  const anchor = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return anchor;
}

export type HookMode = 'custom' | 'default' | 'silent';

export function hookMode(value: string | null | undefined): HookMode {
  if (value === '') return 'silent';
  if (typeof value === 'string' && value.trim()) return 'custom';
  return 'default';
}

/**
 * LiveKit parent Agent onEnter generateReply instructions.
 * null = skip speech for this hook.
 */
export function buildOpeningInstructions(meta: AgentJobMetadata): string | null {
  const custom = meta.prompt.onEnterInstructions;
  // Explicit empty string → silent start.
  if (custom === '') {
    return null;
  }
  let base: string;
  if (typeof custom === 'string' && custom.trim()) {
    base = appendRuntimeContext(custom.trim(), meta);
  } else {
    base = appendRuntimeContext(defaultOpeningInstructions(meta), meta);
  }
  // Ground opening speech on the same clock so “today” is not invented.
  return `${base}\n\n${buildCurrentTimeBlock(meta)}`;
}

/**
 * Verbatim closing line for LiveKit parent Agent onExit (`session.say`).
 * null = skip speech for this hook.
 * Custom text is spoken as-is (not LLM instructions).
 */
export function buildClosingSpeech(meta: AgentJobMetadata): string | null {
  // Native realtime audio does not reliably play session.say() closings.
  if (isRealtimeLlmModel(meta.model)) {
    return null;
  }
  const custom = meta.prompt.onExitInstructions;
  if (custom === '') {
    return null;
  }
  if (typeof custom === 'string' && custom.trim()) {
    return custom.trim();
  }
  if (meta.direction === 'outbound') {
    return 'Thanks for your time. Goodbye.';
  }
  return 'Thanks for calling. Goodbye.';
}

function appendRuntimeContext(instructions: string, meta: AgentJobMetadata): string {
  const ctx = formatContextForInstructions(meta.context);
  if (ctx === 'No additional call context was provided.') {
    return instructions;
  }
  return `${instructions} Runtime context (use only if relevant; do not read raw JSON aloud): ${ctx}`;
}

/** Built-in openings when onEnterInstructions is unset (task + direction aware). */
function defaultOpeningInstructions(meta: AgentJobMetadata): string {
  const demoName = displayNameFromContext(meta.context);

  switch (meta.task) {
    case 'demo_booking':
      return [
        'Greet the person briefly as an automated outbound call about scheduling a product demo.',
        demoName ? `Address them as ${demoName} if appropriate.` : null,
        'Say this will be short: first pick a demo time, then two quick questions about what they want from the product.',
        'Ask what date and time they prefer for the demo.',
      ]
        .filter(Boolean)
        .join(' ');
    case 'interview_booking':
      return [
        'Greet the person briefly as an automated outbound call about scheduling an interview.',
        demoName
          ? `Ask if you are speaking with ${demoName} before discussing times.`
          : 'Ask for their name before discussing times.',
        'Do not offer interview slots until they confirm they are the right person (or they have given their name).',
      ]
        .filter(Boolean)
        .join(' ');
    case 'general':
    default:
      return meta.direction === 'outbound'
        ? 'Greet the person, state that this is an automated outbound call, and ask if it is a good time to talk.'
        : 'Greet the caller and ask how you can help.';
  }
}
