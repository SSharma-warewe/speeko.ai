import { llm } from '@livekit/agents';
import { z } from 'zod';
import { callCalendarApi } from './calendar-api-client.js';
import type { ToolFactory } from './types.js';

const BASE_DESCRIPTION = [
  'Create or update a GoHighLevel contact for this caller (same upsert the get-demo form uses).',
  'Stores ghlContactId on the call so scheduleGhlMeeting can book afterwards.',
  '',
  'WHEN TO USE:',
  '- Before scheduleGhlMeeting when this call has no GHL contact id (missing_contact).',
  '- When you have collected the caller’s name, email, and/or phone and should save them in GHL.',
  '- Lead capture even if they are not booking yet.',
  '',
  'WHEN NOT TO USE:',
  '- Do not invent an email or phone. SIP phoneNumber on this call is enough if they have no email.',
  '- Do not use this for Nylas calendars.',
  '- Do not call again after ok=true unless they gave a different email or phone.',
  '',
  'HOW TO CALL:',
  '- Email or phone is required. Prefer values they just spoke; otherwise use call context.',
  '- firstName / lastName or participantName when known.',
  '- company and notes optional.',
  '',
  'AFTER SUCCESS:',
  '- You may then call scheduleGhlMeeting. Read back that they are saved in the system only if they asked.',
  '',
  'ON FAILURE:',
  '- If missing_identity, ask for email or phone once.',
  '- If unauthorized / contacts.write, say CRM save is not set up. Do not claim they were saved.',
].join('\n');

function readContactId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const id = (data as { contactId?: unknown }).contactId;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

export const createUpsertGhlContactTool: ToolFactory = ({ userData }) => {
  return llm.tool({
    name: 'upsert_ghl_contact',
    description: BASE_DESCRIPTION,
    parameters: z.object({
      firstName: z
        .string()
        .optional()
        .describe('Caller first name when known.'),
      lastName: z
        .string()
        .optional()
        .describe('Caller last name when known.'),
      participantName: z
        .string()
        .optional()
        .describe('Full display name if first/last are not split.'),
      participantEmail: z
        .string()
        .optional()
        .describe('Caller email. Required if no phone is available.'),
      phone: z
        .string()
        .optional()
        .describe(
          'Caller phone. Required if no email. SIP phoneNumber on this call is fine.',
        ),
      company: z
        .string()
        .optional()
        .describe('Company name when they gave one.'),
      notes: z
        .string()
        .optional()
        .describe('Short note for the GHL contact (call reason). Failures are non-fatal.'),
    }),
    execute: async (args) => {
      console.log(
        `[tool:upsertGhlContact] callId=${userData.callId ?? 'n/a'}`,
      );
      const body: Record<string, unknown> = {};
      if (args.firstName) body.firstName = args.firstName;
      if (args.lastName) body.lastName = args.lastName;
      if (args.participantName) body.participantName = args.participantName;
      if (args.participantEmail) body.participantEmail = args.participantEmail;
      if (args.phone) body.phone = args.phone;
      if (args.company) body.company = args.company;
      if (args.notes) body.notes = args.notes;
      const result = await callCalendarApi(userData.callId, 'contacts', body, {
        userData,
        toolId: 'upsertGhlContact',
        namespace: 'ghl-calendar',
      });
      const contactId = readContactId(result.data);
      if (result.ok && contactId) {
        userData.context.ghlContactId = contactId;
      }
      return result;
    },
  });
};
