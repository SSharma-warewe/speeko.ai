import { FunctionTool } from '@google/adk';
import { Type, type Schema } from '@google/genai';
import type { WhatsAppWorkerTurn } from '@call-agent/contracts';
import { HarnessApiClient } from './api-client.js';

export function buildTools(
  turn: WhatsAppWorkerTurn,
  api: HarnessApiClient,
  signal?: AbortSignal,
  lifecycle?: {
    decline?: { evidence: string };
    booking?: Record<string, unknown>;
  },
) {
  const parameters = (fields: string[], required: string[] = []): Schema => ({
    type: Type.OBJECT,
    properties: Object.fromEntries(
      fields.map((field) => [field, { type: Type.STRING }]),
    ),
    required,
  });
  const definitions = [
    {
      name: 'lookupGhlContact',
      description:
        'Find the customer by WhatsApp sender phone and optional email.',
      parameters: parameters(['email']),
    },
    {
      name: 'upsertGhlContact',
      description:
        'Create or update the customer. Collect name and email; the sender phone is supplied by the API.',
      parameters: parameters([
        'firstName',
        'lastName',
        'email',
        'company',
        'notes',
      ]),
    },
    {
      name: 'checkGhlFreeSlots',
      description:
        'Find open slots. Offer only returned startIso values. Supply an IANA timezone for local times.',
      parameters: parameters(
        ['startTime', 'endTime', 'timezone'],
        ['startTime', 'endTime'],
      ),
    },
    {
      name: 'scheduleGhlMeeting',
      description:
        'Book an agreed exact returned slot after finding or creating the contact. Confirm only when ok=true.',
      parameters: parameters(
        ['startTime', 'endTime', 'timezone', 'title', 'description'],
        ['startTime'],
      ),
    },
  ];
  // Keep maxLength out of ADK's generated schema (OpenRouter compatibility).
  // The API validates lengths, authorizes each call, and keeps booking state.
  const tools = definitions
    .filter((definition) =>
      turn.enabledTools.some((id) => id === definition.name),
    )
    .map(
      (definition) =>
        new FunctionTool({
          ...definition,
          execute: async (args) => {
            if (lifecycle?.booking || lifecycle?.decline)
              return { ok: false, error: 'task_closed' };
            const result = await api.post<Record<string, unknown>>(
              turn,
              'tools',
              { toolId: definition.name, args },
              signal,
            );
            if (
              lifecycle &&
              definition.name === 'scheduleGhlMeeting' &&
              result.ok === true &&
              typeof result.appointmentId === 'string' &&
              result.appointmentId.trim()
            )
              lifecycle.booking = result;
            return result;
          },
        }),
    );
  if (turn.task?.status === 'active' && lifecycle)
    tools.push(
      new FunctionTool({
        name: 'declineBooking',
        description:
          'Only when the customer explicitly refuses booking in their current message. Quote their exact refusal. This requests task cancellation, never successful completion or cancellation of an existing GHL appointment. Do not use for scheduling failures, missing details, or questions.',
        parameters: parameters(['evidence'], ['evidence']),
        execute: (args: { evidence: string }) => {
          if (lifecycle.booking) return { ok: false, error: 'already_booked' };
          lifecycle.decline = { evidence: args.evidence };
          return { ok: true, cancellationRequested: true };
        },
      }),
    );
  return tools;
}
