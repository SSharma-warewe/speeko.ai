import { llm, voice } from '@livekit/agents';
import { z } from 'zod';
import { withToolRecording } from '../tools/tool-events.js';
import {
  contextField,
  displayNameFromContext,
  formatContextForInstructions,
} from './context-format.js';
import { markTaskFinished, nullishString } from './task-complete.js';
import type { TaskFactory } from './types.js';

export type DemoBookingResult = {
  outcome:
    | 'BOOKED_AND_QUALIFIED'
    | 'BOOKED_ONLY'
    | 'NOT_BOOKED'
    | 'CALLBACK'
    | 'DECLINED';
  eventId?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  participantEmail?: string;
  /** What they want out of the product / automation. */
  goals?: string;
  /** outbound | inbound | both | other (free text ok). */
  useCase?: string;
  /** What success looks like in ~30–60 days. */
  successCriteria?: string;
  interestLevel?: 'high' | 'medium' | 'low' | 'none';
  notes?: string;
};

function bookingToolLines(enabledTools: string[]): string[] {
  const ids = new Set(enabledTools);
  const useGhl =
    ids.has('checkGhlFreeSlots') || ids.has('scheduleGhlMeeting');
  if (useGhl) {
    const lines: string[] = [];
    if (ids.has('lookupGhlContact')) {
      lines.push(
        '- Before booking, call lookup_ghl_contact with their email or phone (SIP phoneNumber is enough if they have no email). If found=false, call upsert_ghl_contact with name, email, and phone. Do not invent an email. Never pass a phone as a contact id.',
      );
    } else if (ids.has('upsertGhlContact')) {
      lines.push(
        '- Before booking, call upsert_ghl_contact with their name, email, and phone (email or phone required) so GoHighLevel has a contact id. SIP phoneNumber is enough if they have no email. Do not invent an email.',
      );
    }
    lines.push(
      '- ALWAYS call check_ghl_free_slots for the proposed day or window before confirming a time.',
      '- If free, book with schedule_ghl_meeting (title like “Demo — {name}”, include email when known). Pass the exact startIso from check_ghl_free_slots.',
      '- NEVER claim the demo is booked unless schedule_ghl_meeting returned ok. If tools fail, say so and offer another time or a human callback.',
    );
    return lines;
  }
  return [
    '- ALWAYS call check_calendar_availability (or checkCalendarAvailability) for the proposed slot before confirming.',
    '- If free, create the event with create_calendar_event / createCalendarEvent (title like “Demo — {name}”, include email when known).',
    '- NEVER claim the demo is booked unless create_calendar_event returned ok/success. If tools fail, say so and offer another time or a human callback.',
  ];
}

/**
 * Workflow: schedule a demo on the calendar, then ask short product-discovery questions.
 * Persona (tone/company) stays on the parent Agent system prompt.
 */
export const createDemoBookingTask: TaskFactory = ({
  meta,
  userData,
  tools,
  chatCtx,
}) => {
  const name = displayNameFromContext(meta.context);
  const email = contextField(meta.context, 'email', 'participantEmail');
  const company = contextField(meta.context, 'company', 'companyName');

  const task = voice.AgentTask.create<DemoBookingResult>({
    instructions: [
      'Your objective is a two-phase outbound demo call.',
      name ? `The contact name is ${name}.` : null,
      company ? `Their company is ${company}.` : null,
      email
        ? `They provided email ${email} — use it for the calendar invite when booking.`
        : 'If you need an email for the invite and it is missing, ask once after agreeing a time.',
      '',
      'PHASE 1 — BOOKING (do this first):',
      '- Confirm it is a good time to talk briefly.',
      '- Ask for a preferred date and time for a demo (default duration 30 minutes if unspecified).',
      '- Resolve relative times using the authoritative call clock in system instructions. Never append Z to a local wall-clock time.',
      ...bookingToolLines(meta.enabledTools),
      '- After a successful book, read back the confirmed time in natural language once.',
      '',
      'PHASE 2 — PRODUCT DISCOVERY (only after booking succeeds, or if they refuse to book but still want to talk):',
      '- Do NOT end the call after booking. Do NOT ask “anything else?” as a way to skip this phase.',
      '- Ask about 2 short questions, one at a time (skip any already answered in context):',
      '  1) What do they want out of the product / voice automation? (main goal or use case: outbound dialing, inbound answering, both, support, etc.)',
      '  2) What would success look like in the next 30–60 days? (optional third: biggest current friction if time allows)',
      '- Keep answers brief; paraphrase and confirm only if unclear.',
      '',
      'COMPLETION:',
      '- When booking is done (or clearly not happening) AND you have discovery answers (or they declined questions), call complete_demo_booking_task.',
      '- Prefer outcome BOOKED_AND_QUALIFIED when an event was created and you captured goals or useCase.',
      '- Use BOOKED_ONLY if booked but they refused discovery. NOT_BOOKED if no event. CALLBACK if they asked to reschedule the call. DECLINED if not interested.',
      '- After complete_demo_booking_task succeeds, the system hangs up automatically — do not also call end_call.',
      '- If they say goodbye or ask to stop mid-flow, prefer completing with the best-fit outcome (DECLINED / BOOKED_ONLY / etc.) then hangup; else call end_call.',
      `Runtime context: ${formatContextForInstructions(meta.context)}`,
    ]
      .filter((line) => line !== null)
      .join(' '),
    chatCtx,
    tools: [
      ...tools,
      llm.tool({
        name: 'complete_demo_booking_task',
        description:
          'Mark the demo booking + discovery workflow complete. Prefer BOOKED_AND_QUALIFIED only when a calendar event was created and goals/useCase are filled.',
        parameters: z.object({
          outcome: z.enum([
            'BOOKED_AND_QUALIFIED',
            'BOOKED_ONLY',
            'NOT_BOOKED',
            'CALLBACK',
            'DECLINED',
          ]),
          eventId: nullishString.describe(
            'Calendar event / appointment id from schedule_ghl_meeting or create_calendar_event when booked',
          ),
          scheduledStart: nullishString.describe(
            'Booked start time ISO or natural time string',
          ),
          scheduledEnd: nullishString,
          participantEmail: nullishString,
          goals: nullishString.describe(
            'What they want out of the product / automation',
          ),
          useCase: nullishString.describe(
            'e.g. outbound, inbound, both, support, other',
          ),
          successCriteria: nullishString.describe(
            'What success looks like in 30–60 days',
          ),
          interestLevel: z.enum(['high', 'medium', 'low', 'none']).nullish(),
          notes: nullishString,
        }),
        execute: async (args) =>
          withToolRecording(
            userData,
            'complete_demo_booking_task',
            args,
            async () => {
              const result: DemoBookingResult = {
                outcome: args.outcome,
                eventId: args.eventId ?? undefined,
                scheduledStart: args.scheduledStart ?? undefined,
                scheduledEnd: args.scheduledEnd ?? undefined,
                participantEmail: args.participantEmail ?? email,
                goals: args.goals ?? undefined,
                useCase: args.useCase ?? undefined,
                successCriteria: args.successCriteria ?? undefined,
                interestLevel: args.interestLevel ?? undefined,
                notes: args.notes ?? undefined,
              };
              markTaskFinished(userData, 'demo_booking', result);
              task.complete(result);
              return {
                ok: true,
                ...result,
                message: `Demo booking task complete: ${args.outcome}`,
              };
            },
          ).then((r) => r.message),
      }),
    ],
  });

  return task as unknown as voice.AgentTask<Record<string, unknown>>;
};
