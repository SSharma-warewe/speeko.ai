import { llm } from '@livekit/agents';
import { z } from 'zod';
import { buildToolClockHint } from '../builders/prompt-builder.js';
import { callCalendarApi } from './calendar-api-client.js';
import type { ToolFactory } from './types.js';

/**
 * Detailed description so the voice LLM knows WHEN and HOW to use free/busy.
 */
const BASE_DESCRIPTION = [
  'Check whether the business calendar is free or busy in a time window (Nylas free/busy).',
  '',
  'WHEN TO USE:',
  '- Before offering or confirming an appointment time, always check this window first.',
  '- When the caller asks “are you free on Tuesday afternoon?” or proposes a specific time.',
  '- When you need to suggest alternatives: check a broader window (e.g. whole day or next few days), then propose times that fall outside the busy blocks.',
  '',
  'WHEN NOT TO USE:',
  '- Do not use after you already confirmed a booking without a time change.',
  '- Do not use for looking up past appointments by title — use listCalendarEvents instead.',
  '- Do not invent free slots if this tool fails; say the calendar is unavailable and offer to call back.',
  '',
  'HOW TO CALL:',
  '- startTime / endTime: ISO-8601 preferred or unix seconds as a string.',
  '- Resolve relative phrases (today, tomorrow, next Monday) using the AUTHORITATIVE CLOCK in system instructions and the clock suffix below — never guess the calendar year.',
  '- Window should cover the full period you care about (minimum the proposed slot; better a half-day or full day when shopping for times).',
  '- endTime must be after startTime.',
  '',
  'HOW TO INTERPRET RESULTS:',
  '- ok=true with empty busySlots means the calendar looks free in that window.',
  '- busySlots list blocks that are occupied — any proposed meeting that overlaps a busy block is NOT available.',
  '- If error is window_in_past, re-resolve times with the authoritative clock and call again.',
  '- Speak results briefly: e.g. “Tuesday from 2 to 3 is free” or “That time is busy; I have openings after 4pm.”',
  '- Never read raw unix timestamps to the caller; use natural language times.',
  '',
  'REQUIRES: agent has a Nylas calendar integration linked in the portal. If the tool says calendar_not_linked, explain that scheduling is not configured and take a manual callback request.',
].join('\n');

export const createCheckCalendarAvailabilityTool: ToolFactory = ({
  meta,
  userData,
}) => {
  const clockHint = buildToolClockHint(meta);
  return llm.tool({
    name: 'check_calendar_availability',
    description: `${BASE_DESCRIPTION}\n\n${clockHint}`,
    parameters: z.object({
      startTime: z
        .string()
        .describe(
          `Start of the search window as ISO-8601 (preferred) or unix seconds string. Ground on the call clock: ${clockHint}`,
        ),
      endTime: z
        .string()
        .describe(
          'End of the search window as ISO-8601 or unix seconds string. Must be after startTime. Use at least the full proposed slot length; use a wider window when looking for alternatives.',
        ),
    }),
    execute: async ({ startTime, endTime }) => {
      console.log(
        `[tool:checkCalendarAvailability] callId=${userData.callId ?? 'n/a'} start=${startTime} end=${endTime}`,
      );
      return callCalendarApi(
        userData.callId,
        'free-busy',
        { startTime, endTime },
        { userData, toolId: 'checkCalendarAvailability' },
      );
    },
  });
};
