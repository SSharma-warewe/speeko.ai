import type { SessionUserData } from './types.js';
/** Capture minimal successful evidence before log/result sanitization. Stub bookings are excluded. */
export function captureBookingReceipt(
  userData: SessionUserData,
  toolId: string,
  result: { ok: boolean; data?: unknown },
  args: Record<string, unknown>,
) {
  if (
    result.ok &&
    toolId === 'cancelCalendarEvent' &&
    args.eventId === userData.bookingReceipt?.eventId
  ) {
    userData.bookingReceipt = undefined;
    return;
  }
  if (
    !result.ok ||
    (toolId !== 'scheduleGhlMeeting' && toolId !== 'createCalendarEvent') ||
    !result.data ||
    typeof result.data !== 'object'
  )
    return;
  const data = result.data as Record<string, unknown>;
  const eventId = data.appointmentId ?? data.eventId;
  if (typeof eventId !== 'string' || !eventId.trim()) return;
  userData.bookingReceipt = {
    toolId,
    eventId,
    scheduledStart: String(
      data.startIso ?? data.startTime ?? data.start ?? args.startTime ?? '',
    ) || undefined,
    scheduledEnd: String(
      data.endIso ?? data.endTime ?? data.end ?? args.endTime ?? '',
    ) || undefined,
  };
}
