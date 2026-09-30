/** Best-effort sender country code → IANA timezone, matching the voice clock. */
export function whatsAppSenderTimeZone(sessionId: string): string {
  const sender = sessionId.slice(sessionId.lastIndexOf(':') + 1);
  const digits = sender.replace(/\D/g, '');
  if (digits.length < 8) return 'UTC';
  const prefixes: Array<[string, string]> = [
    ['91', 'Asia/Kolkata'],
    ['44', 'Europe/London'],
    ['61', 'Australia/Sydney'],
    ['65', 'Asia/Singapore'],
    ['971', 'Asia/Dubai'],
    ['81', 'Asia/Tokyo'],
    ['49', 'Europe/Berlin'],
    ['33', 'Europe/Paris'],
    ['34', 'Europe/Madrid'],
    ['39', 'Europe/Rome'],
    ['31', 'Europe/Amsterdam'],
    ['353', 'Europe/Dublin'],
    ['1', 'America/New_York'],
  ];
  return prefixes.find(([prefix]) => digits.startsWith(prefix))?.[1] ?? 'UTC';
}

function localDate(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(value('year'), value('month') - 1, value('day')));
}

function formatDay(day: Date): {
  weekday: string;
  longDate: string;
  ymd: string;
} {
  return {
    weekday: new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'long',
    }).format(day),
    longDate: new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(day),
    ymd: day.toISOString().slice(0, 10),
  };
}

/** Rebuilt for every ADK model request, including turns in a cached session. */
export function buildWhatsAppInstruction(
  instruction: string,
  sessionId: string,
  now: Date = new Date(),
): string {
  const timeZone = whatsAppSenderTimeZone(sessionId);
  const todayDate = localDate(now, timeZone);
  const week = Array.from({ length: 7 }, (_, offset) =>
    formatDay(new Date(todayDate.getTime() + offset * 86_400_000)),
  );
  const today = week[0];
  const tomorrow = week[1];
  const localTime = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(now);
  return [
    instruction,
    '=== AUTHORITATIVE CLOCK (current for this message) ===',
    `Timezone inferred from the WhatsApp sender: ${timeZone}. Use a timezone the customer states instead when different.`,
    `Right now (local): ${today.weekday}, ${today.longDate} at ${localTime}`,
    `Today: ${today.weekday} ${today.longDate} (${today.ymd})`,
    `Tomorrow: ${tomorrow.weekday} ${tomorrow.longDate} (${tomorrow.ymd})`,
    `Next 7 days: ${week.map((day) => `${day.weekday}=${day.ymd}`).join(', ')}`,
    `UTC now: ${now.toISOString()}`,
    "Resolve relative dates such as today, tomorrow, and next Monday from this clock. Ask for the customer's timezone if the phone-based guess is ambiguous.",
    'For local meeting times, pass YYYY-MM-DDTHH:mm:ss without Z plus an IANA timezone to calendar tools. Z means UTC.',
    '=== END CLOCK ===',
  ].join('\n');
}
