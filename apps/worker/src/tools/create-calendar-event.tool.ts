import { llm } from '@livekit/agents';
import { z } from 'zod';
import { buildToolClockHint } from '../builders/prompt-builder.js';
import { callCalendarApi } from './calendar-api-client.js';
import type { ToolFactory } from './types.js';

const BASE_DESCRIPTION = [
  'Create a real calendar event on the business Nylas calendar (books a slot).',
  '',
  'WHEN TO USE:',
  '- The caller has clearly agreed to a specific date and time (and duration if discussed).',
  '- You already checked availability with checkCalendarAvailability for that slot (or a covering window) and it is free.',
  '- You are ready to commit the booking — this writes to the real calendar and may notify participants if email is provided.',
  '',
  'WHEN NOT TO USE:',
  '- Never create an event while still negotiating times or if the caller only said “maybe”.',
  '- Never create if free/busy said the slot is busy, unless the caller explicitly wants to double-book (rare; confirm first).',
  '- Do not use the stub “booking” tool for real calendar bookings when this tool is available — prefer this tool.',
  '- Do not call this multiple times for the same appointment if the first call returned ok=true.',
  '',
  'HOW TO CALL:',
  '- title: short clear title (include customer name when known), e.g. “Consultation — Ada Lovelace”.',
  '- startTime / endTime: ISO-8601 preferred or unix seconds. Resolve “tomorrow at 3” from the authoritative call clock first.',
  '- endTime must be after startTime. Default duration 30 minutes if the caller did not specify.',
  '- timezone: IANA zone when the caller spoke in local time (e.g. America/New_York, Asia/Kolkata). Prefer converting to correct absolute times; if context has timezone, use it.',
  '- participantEmail / participantName: set when you have the caller’s email so they get a calendar invite when the provider supports it.',
  '- description / location: optional notes, phone, or address.',
  '',
  'AFTER SUCCESS:',
  '- Read back the confirmed time in natural language and the eventId only if useful for cancel later.',
  '- Do not invent a confirmation number beyond the tool’s eventId / message.',
  '',
  'ON FAILURE:',
  '- Apologize; do not claim the appointment is booked. Offer to try another time or a human follow-up.',
  '',
  'REQUIRES: linked Nylas calendar on the agent.',
].join('\n');

export const createCreateCalendarEventTool: ToolFactory = ({ meta, userData }) => {
  const clockHint = buildToolClockHint(meta);
  return llm.tool({
    name: 'create_calendar_event',
    description: `${BASE_DESCRIPTION}\n\n${clockHint}`,
    parameters: z.object({
      title: z
        .string()
        .describe(
          'Event title shown on the calendar. Include the purpose and customer name when known.',
        ),
      startTime: z
        .string()
        .describe(
          `Event start as ISO-8601 (preferred) or unix seconds string. ${clockHint}`,
        ),
      endTime: z
        .string()
        .describe(
          'Event end as ISO-8601 or unix seconds. Must be after startTime. Use 30 minutes if duration was not specified.',
        ),
      timezone: z
        .string()
        .optional()
        .describe(
          'IANA timezone for the event (e.g. America/Los_Angeles, Asia/Kolkata). Use when converting local spoken times.',
        ),
      description: z
        .string()
        .optional()
        .describe('Optional notes (call reason, phone number, special requests).'),
      location: z
        .string()
        .optional()
        .describe('Optional location or “Phone call” / video link label.'),
      participantEmail: z
        .string()
        .optional()
        .describe(
          'Caller email for calendar invite when available. Only use a verified address from the conversation or context.',
        ),
      participantName: z
        .string()
        .optional()
        .describe('Caller display name for the invite participant.'),
    }),
    execute: async (args) => {
      console.log(
        `[tool:createCalendarEvent] callId=${userData.callId ?? 'n/a'} title=${args.title} start=${args.startTime}`,
      );
      const body: Record<string, unknown> = {
        title: args.title,
        startTime: args.startTime,
        endTime: args.endTime,
      };
      if (args.timezone) body.timezone = args.timezone;
      if (args.description) body.description = args.description;
      if (args.location) body.location = args.location;
      if (args.participantEmail) body.participantEmail = args.participantEmail;
      if (args.participantName) body.participantName = args.participantName;
      return callCalendarApi(userData.callId, 'events', body, {
        userData,
        toolId: 'createCalendarEvent',
      });
    },
  });
};
