import { llm, voice } from '@livekit/agents';
import { z } from 'zod';
import { withToolRecording } from '../tools/tool-events.js';
import { contextField, formatContextForInstructions } from './context-format.js';
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

function displayNameFromContext(
  context: Record<string, unknown> | undefined,
): string | undefined {
  const full = contextField(
    context,
    'customerName',
    'patientName',
    'name',
    'fullName',
  );
  if (full) return full;
  const first = contextField(context, 'firstName', 'first_name');
  const last = contextField(context, 'lastName', 'last_name');
  if (first && last) return `${first} ${last}`;
  return first ?? last;
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
      '- Resolve relative times using the authoritative call clock in system instructions.',
      '- ALWAYS call check_calendar_availability (or checkCalendarAvailability) for the proposed slot before confirming.',
      '- If free, create the event with create_calendar_event / createCalendarEvent (title like “Demo — {name}”, include email when known).',
      '- NEVER claim the demo is booked unless create_calendar_event returned ok/success. If tools fail, say so and offer another time or a human callback.',
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
          eventId: z
            .string()
            .optional()
            .describe('Calendar event id from create_calendar_event when booked'),
          scheduledStart: z
            .string()
            .optional()
            .describe('Booked start time ISO or natural time string'),
          scheduledEnd: z.string().optional(),
          participantEmail: z.string().optional(),
          goals: z
            .string()
            .optional()
            .describe('What they want out of the product / automation'),
          useCase: z
            .string()
            .optional()
            .describe('e.g. outbound, inbound, both, support, other'),
          successCriteria: z
            .string()
            .optional()
            .describe('What success looks like in 30–60 days'),
          interestLevel: z.enum(['high', 'medium', 'low', 'none']).optional(),
          notes: z.string().optional(),
        }),
        execute: async (args) =>
          withToolRecording(
            userData,
            'complete_demo_booking_task',
            args,
            async () => {
              const result: DemoBookingResult = {
                outcome: args.outcome,
                eventId: args.eventId,
                scheduledStart: args.scheduledStart,
                scheduledEnd: args.scheduledEnd,
                participantEmail: args.participantEmail ?? email,
                goals: args.goals,
                useCase: args.useCase,
                successCriteria: args.successCriteria,
                interestLevel: args.interestLevel,
                notes: args.notes,
              };
              userData.taskResult = { task: 'demo_booking', ...result };
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
