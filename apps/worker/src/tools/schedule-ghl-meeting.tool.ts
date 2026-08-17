import { llm } from '@livekit/agents';
import { z } from 'zod';
import { buildToolClockHint } from '../builders/prompt-builder.js';
import { callCalendarApi } from './calendar-api-client.js';
import type { ToolFactory } from './types.js';

const BASE_DESCRIPTION = [
  'Book a meeting on the organization GoHighLevel calendar linked to this agent (creates a real appointment).',
  '',
  'WHEN TO USE:',
  '- The caller agreed to a specific time you already saw in checkGhlFreeSlots.',
  '- You are ready to commit — this writes to the live calendar and may notify them.',
  '',
  'WHEN NOT TO USE:',
  '- Never book while still negotiating times, or if they only said “maybe”.',
  '- Do not use Nylas createCalendarEvent for this calendar.',
  '- Do not call again if the first call returned ok=true.',
  '',
  'HOW TO CALL:',
  '- startTime: pass the exact startIso from checkGhlFreeSlots when possible (keeps the offset).',
  '- If you must convert a spoken local time, use naive ISO (no Z) plus timezone. Never append Z to a local wall-clock.',
  '- endTime: optional; defaults to 30 minutes after start.',
  '- title: short, include their name when known (e.g. “Meeting — Ada”).',
  '- participantEmail / phone / participantName: for the title only.',
  '- contactId: only if the caller gave a GHL contact id; otherwise the API uses ghlContactId from call context.',
  '',
  'AFTER SUCCESS:',
  '- Read back the confirmed time in natural language once.',
  '- Do not invent a confirmation number beyond appointmentId.',
  '',
  'ON FAILURE:',
  '- If slot_unavailable, check free slots again. Do not claim it is booked.',
  '- If missing_contact, the call has no GHL contact id. Do not invent one. Do not claim it is booked.',
].join('\n');

export const createScheduleGhlMeetingTool: ToolFactory = ({
  meta,
  userData,
}) => {
  const clockHint = buildToolClockHint(meta);
  return llm.tool({
    name: 'schedule_ghl_meeting',
    description: `${BASE_DESCRIPTION}\n\n${clockHint}`,
    parameters: z.object({
      startTime: z
        .string()
        .describe(
          `Slot start as ISO-8601 (prefer exact startIso from checkGhlFreeSlots). ${clockHint}`,
        ),
      endTime: z
        .string()
        .optional()
        .describe('Optional end (ISO or unix seconds). Defaults to 30 minutes.'),
      timezone: z
        .string()
        .optional()
        .describe('IANA timezone when converting a spoken local time.'),
      title: z
        .string()
        .optional()
        .describe('Event title. Include purpose and caller name when known.'),
      description: z
        .string()
        .optional()
        .describe('Optional notes (call reason, phone).'),
      participantEmail: z
        .string()
        .optional()
        .describe('Caller email for the GHL contact and notifications.'),
      participantName: z
        .string()
        .optional()
        .describe('Caller display name.'),
      phone: z
        .string()
        .optional()
        .describe('Caller phone for the title if needed.'),
      contactId: z
        .string()
        .optional()
        .describe(
          'Existing GHL contact id. Prefer call context ghlContactId; this tool does not create contacts.',
        ),
    }),
    execute: async (args) => {
      console.log(
        `[tool:scheduleGhlMeeting] callId=${userData.callId ?? 'n/a'} start=${args.startTime}`,
      );
      const body: Record<string, unknown> = { startTime: args.startTime };
      if (args.endTime) body.endTime = args.endTime;
      if (args.timezone) body.timezone = args.timezone;
      if (args.title) body.title = args.title;
      if (args.description) body.description = args.description;
      if (args.participantEmail) body.participantEmail = args.participantEmail;
      if (args.participantName) body.participantName = args.participantName;
      if (args.phone) body.phone = args.phone;
      if (args.contactId) body.contactId = args.contactId;
      return callCalendarApi(userData.callId, 'appointments', body, {
        userData,
        toolId: 'scheduleGhlMeeting',
        namespace: 'ghl-calendar',
      });
    },
  });
};
