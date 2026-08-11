import { llm } from '@livekit/agents';
import { z } from 'zod';
import { callCalendarApi } from './calendar-api-client.js';
import type { ToolFactory } from './types.js';

const DESCRIPTION = [
  'Cancel (delete) an existing event on the business Nylas calendar by eventId.',
  '',
  'WHEN TO USE:',
  '- Caller wants to cancel an appointment that exists on this calendar.',
  '- You have a concrete eventId from createCalendarEvent earlier in this call, or from listCalendarEvents.',
  '- Caller confirmed they want cancellation (not just asking “what if I cancel?”).',
  '',
  'WHEN NOT TO USE:',
  '- Do not cancel without a valid eventId — first listCalendarEvents for the relevant day and match title/time.',
  '- Do not cancel if the caller only wants to reschedule: cancel then createCalendarEvent at the new time, or create first then cancel old if policy requires (prefer cancel-then-create only after both times are clear).',
  '- Do not use cancelBooking (stub) for real Nylas events when this tool is available.',
  '',
  'HOW TO CALL:',
  '- eventId: exact id string from a previous tool result (e.g. create or list). Never invent an id.',
  '',
  'AFTER SUCCESS:',
  '- Confirm cancellation in plain language with the original time/title if known.',
  '',
  'ON FAILURE:',
  '- Say you could not cancel in the system; offer human follow-up. Do not claim it was cancelled.',
  '',
  'REQUIRES: linked Nylas calendar on the agent.',
].join('\n');

export const createCancelCalendarEventTool: ToolFactory = ({ userData }) =>
  llm.tool({
    name: 'cancel_calendar_event',
    description: DESCRIPTION,
    parameters: z.object({
      eventId: z
        .string()
        .describe(
          'Nylas event id from createCalendarEvent or listCalendarEvents. Required; do not invent.',
        ),
    }),
    execute: async ({ eventId }) => {
      console.log(
        `[tool:cancelCalendarEvent] callId=${userData.callId ?? 'n/a'} eventId=${eventId}`,
      );
      return callCalendarApi(
        userData.callId,
        'events/cancel',
        { eventId },
        { userData, toolId: 'cancelCalendarEvent' },
      );
    },
  });
