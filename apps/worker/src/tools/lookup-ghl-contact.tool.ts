import { llm } from '@livekit/agents';
import { z } from 'zod';
import { callCalendarApi } from './calendar-api-client.js';
import type { ToolFactory } from './types.js';

const BASE_DESCRIPTION = [
  'Look up an existing GoHighLevel contact by email or phone. Does not create a contact.',
  'Stores ghlContactId on the call when found so scheduleGhlMeeting can book.',
  '',
  'WHEN TO USE:',
  '- Before scheduleGhlMeeting when this call has no GHL contact id (missing_contact).',
  '- Before upsert_ghl_contact, to reuse an existing lead instead of creating a duplicate.',
  '',
  'WHEN NOT TO USE:',
  '- Do not invent an email or phone. SIP phoneNumber on this call is enough if they have no email.',
  '- Do not pass a phone number as a contact id on scheduleGhlMeeting.',
  '- Do not use this for Nylas calendars.',
  '',
  'HOW TO CALL:',
  '- Email or phone is required. Prefer values they just spoke; otherwise use call context.',
  '',
  'AFTER SUCCESS:',
  '- If found=true, you may call scheduleGhlMeeting. Do not invent a contact id.',
  '- If found=false, call upsert_ghl_contact with name/email/phone, then book.',
  '',
  'ON FAILURE:',
  '- If missing_identity, ask for email or phone once.',
  '- If unauthorized / contacts.readonly, say CRM lookup is not set up. Do not claim they were found.',
].join('\n');

function readLookupData(data: unknown): {
  found?: boolean;
  contactId?: string;
} {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const rec = data as { found?: unknown; contactId?: unknown };
  const contactId =
    typeof rec.contactId === 'string' && rec.contactId.trim()
      ? rec.contactId.trim()
      : undefined;
  return {
    found: rec.found === true,
    contactId,
  };
}

export const createLookupGhlContactTool: ToolFactory = ({ userData }) => {
  return llm.tool({
    name: 'lookup_ghl_contact',
    description: BASE_DESCRIPTION,
    parameters: z.object({
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
    }),
    execute: async (args) => {
      console.log(
        `[tool:lookupGhlContact] callId=${userData.callId ?? 'n/a'}`,
      );
      const body: Record<string, unknown> = {};
      if (args.participantEmail) body.participantEmail = args.participantEmail;
      if (args.phone) body.phone = args.phone;
      const result = await callCalendarApi(
        userData.callId,
        'contacts/lookup',
        body,
        {
          userData,
          toolId: 'lookupGhlContact',
          namespace: 'ghl-calendar',
        },
      );
      const { found, contactId } = readLookupData(result.data);
      if (result.ok && found && contactId) {
        userData.context.ghlContactId = contactId;
      }
      return result;
    },
  });
};
