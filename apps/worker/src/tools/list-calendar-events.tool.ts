import { llm } from '@livekit/agents';
import { z } from 'zod';
import { buildToolClockHint } from '../builders/prompt-builder.js';
import { callCalendarApi } from './calendar-api-client.js';
import type { ToolFactory } from './types.js';

const BASE_DESCRIPTION = [
  'List existing events on the business calendar in a date/time range (Nylas events list).',
  '',
  'WHEN TO USE:',
  '- Caller asks what is already scheduled (“what’s on the calendar tomorrow?”, “do I already have something at 3?”).',
  '- You need an eventId to cancel or reschedule (cancel requires eventId from list or a prior create).',
  '- You want more detail than free/busy (titles, locations) for a small range.',
  '',
  'WHEN NOT TO USE:',
  '- Prefer checkCalendarAvailability when you only need free vs busy to offer a new slot (lighter, no titles needed).',
  '- Do not dump long lists of events to the caller — summarize 1–3 relevant items in speech.',
  '- Do not use to create bookings — use createCalendarEvent after the caller agrees to a time.',
  '',
  'HOW TO CALL:',
  '- startTime / endTime: optional ISO-8601 or unix seconds; ground relative days on the authoritative call clock.',
  '- Prefer a tight window (same day or next 2–3 days) so results stay short.',
  '- limit: optional, max 20, default 10. Keep low for voice (e.g. 5–10).',
  '',
  'HOW TO INTERPRET RESULTS:',
  '- Each event has eventId, title, startIso/endIso, location, status.',
  '- Save eventId if the caller may want to cancel later in the same call.',
  '- If empty, say there are no events in that range (calendar may still have busy blocks from other sources — free/busy is authoritative for conflicts).',
  '',
  'REQUIRES: linked Nylas calendar on the agent. On failure, do not invent events.',
].join('\n');

export const createListCalendarEventsTool: ToolFactory = ({ meta, userData }) => {
  const clockHint = buildToolClockHint(meta);
  return llm.tool({
    name: 'list_calendar_events',
    description: `${BASE_DESCRIPTION}\n\n${clockHint}`,
    parameters: z.object({
      startTime: z
        .string()
        .optional()
        .describe(
          `Optional range start (ISO-8601 or unix seconds). ${clockHint}`,
        ),
      endTime: z
        .string()
        .optional()
        .describe(
          'Optional range end (ISO-8601 or unix seconds). Must be after startTime when both are set.',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Max events to return (1–20). Prefer 5–10 for voice calls.'),
    }),
    execute: async ({ startTime, endTime, limit }) => {
      console.log(
        `[tool:listCalendarEvents] callId=${userData.callId ?? 'n/a'} start=${startTime ?? '-'} end=${endTime ?? '-'}`,
      );
      const body: Record<string, unknown> = {};
      if (startTime) body.startTime = startTime;
      if (endTime) body.endTime = endTime;
      if (limit != null) body.limit = limit;
      return callCalendarApi(userData.callId, 'events/list', body, {
        userData,
        toolId: 'listCalendarEvents',
      });
    },
  });
};
