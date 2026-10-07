import { OrganizationQueueSettings } from './organization-queue-settings.entity';

export function parseQuietTime(value: string | null): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value?.trim() ?? '');
  if (!match) return null;
  const hour = Number(match[1]),
    minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}

/** Invalid enabled configuration fails closed at admission. */
export function quietHoursState(
  at: Date,
  settings: OrganizationQueueSettings,
): 'open' | 'quiet' | 'invalid' {
  if (!settings.quietHoursEnabled) return 'open';
  const start = parseQuietTime(settings.quietHoursStart);
  const end = parseQuietTime(settings.quietHoursEnd);
  if (start === null || end === null) return 'invalid';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: settings.quietHoursTimezone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
    const minutes =
      Number(parts.find((p) => p.type === 'hour')!.value) * 60 +
      Number(parts.find((p) => p.type === 'minute')!.value);
    const quiet =
      start < end
        ? minutes >= start && minutes < end
        : minutes >= start || minutes < end;
    return quiet ? 'quiet' : 'open';
  } catch {
    return 'invalid';
  }
}
