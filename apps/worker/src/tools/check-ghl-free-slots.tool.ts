import { llm } from '@livekit/agents';
import { z } from 'zod';
import { buildToolClockHint } from '../builders/prompt-builder.js';
import { callCalendarApi } from './calendar-api-client.js';
import type { ToolFactory } from './types.js';

const BASE_DESCRIPTION = [
  'Get OPEN time slots on the organization GoHighLevel calendar linked to this agent.',
  'Returns only free starts — existing appointments are hidden for privacy.',
  '',
  'WHEN TO USE:',
  '- Before offering or confirming a meeting time.',
  '- When the caller asks if a day or window is available, or wants alternatives.',
  '',
  'WHEN NOT TO USE:',
  '- Do not use Nylas checkCalendarAvailability / listCalendarEvents for this calendar.',
  '- Do not invent times if this tool fails.',
  '- There is no tool to list existing appointments — never claim you can see them.',
  '',
  'HOW TO CALL:',
  '- startTime / endTime: ISO-8601 preferred or unix seconds.',
  '- Resolve relative phrases (today, tomorrow, Monday) from the AUTHORITATIVE CLOCK below — use that weekday’s ymd, not a guess.',
  '- If the caller spoke local time, pass timezone AND a naive local ISO (2026-08-14T15:30:00). Do NOT append Z — Z means UTC and will search the wrong hour.',
  '- Use a useful window (half-day or full day) when shopping for times. Do not probe a single 60-minute needle.',
  '- timezone: IANA (e.g. Asia/Kolkata) when the caller spoke in local time.',
  '',
  'HOW TO INTERPRET RESULTS:',
  '- ok=true slots[] are the ONLY times you may offer. Each has startIso and endIso.',
  '- Empty slots means nothing open in that window — offer another day.',
  '- Speak naturally (“Thursday at 2pm”). Never read raw ISO to the caller.',
  '- When booking, pass startIso to scheduleGhlMeeting exactly as returned.',
  '',
  'REQUIRES: a GoHighLevel calendar linked on this organization agent. If the tool says calendar is not linked or not configured, say scheduling is not set up.',
].join('\n');

export const createCheckGhlFreeSlotsTool: ToolFactory = ({
  meta,
  userData,
}) => {
  const clockHint = buildToolClockHint(meta);
  return llm.tool({
    name: 'check_ghl_free_slots',
    description: `${BASE_DESCRIPTION}\n\n${clockHint}`,
    parameters: z.object({
      startTime: z
        .string()
        .describe(
          `Start of the search window. For local spoken times use naive ISO (no Z) plus timezone. ${clockHint}`,
        ),
      endTime: z
        .string()
        .describe(
          'End of the search window as ISO-8601 or unix seconds. Must be after startTime.',
        ),
      timezone: z
        .string()
        .optional()
        .describe(
          'IANA timezone for slot labels (e.g. Asia/Kolkata, America/New_York).',
        ),
    }),
    execute: async ({ startTime, endTime, timezone }) => {
      console.log(
        `[tool:checkGhlFreeSlots] callId=${userData.callId ?? 'n/a'} start=${startTime} end=${endTime}`,
      );
      const body: Record<string, unknown> = { startTime, endTime };
      if (timezone) body.timezone = timezone;
      return callCalendarApi(userData.callId, 'free-slots', body, {
        userData,
        toolId: 'checkGhlFreeSlots',
        namespace: 'ghl-calendar',
      });
    },
  });
};
