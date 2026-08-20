import { llm, voice } from '@livekit/agents';
import { z } from 'zod';
import type { AgentJobMetadata } from '../job-metadata.js';
import { withToolRecording } from '../tools/tool-events.js';
import {
  contextField,
  displayNameFromContext,
  formatContextForInstructions,
} from './context-format.js';
import { markTaskFinished, nullishString } from './task-complete.js';
import type { TaskFactory } from './types.js';

export type InterviewBookingResult = {
  outcome:
    | 'BOOKED'
    | 'NOT_BOOKED'
    | 'WRONG_PERSON'
    | 'CALLBACK'
    | 'DECLINED';
  confirmedName?: string;
  eventId?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  participantEmail?: string;
  notes?: string;
};

function durationMinutesFromContext(
  context: Record<string, unknown> | undefined,
): string {
  const raw = contextField(
    context,
    'durationMinutes',
    'duration',
    'interviewDuration',
  );
  if (!raw) return '30';
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n > 0 && n <= 480) return String(n);
  return '30';
}

/**
 * Workflow instructions only — calendar *implementations* come from enabled tools.
 * Do not name GHL vs Nylas tool ids here.
 */
export function buildInterviewBookingInstructions(
  meta: AgentJobMetadata,
): string {
  const name = displayNameFromContext(meta.context);
  const email = contextField(meta.context, 'email', 'participantEmail');
  const durationMinutes = durationMinutesFromContext(meta.context);

  return [
    'Your objective is a two-phase outbound interview-scheduling call.',
    name
      ? `The expected contact name is ${name}. Confirm you are speaking with that person before booking.`
      : 'No expected name was provided. Ask once for their name, then use it going forward.',
    email
      ? `They provided email ${email} — use it for the calendar invite when booking.`
      : 'If you need an email for the invite and it is missing, ask once after agreeing a time.',
    `Default interview length is ${durationMinutes} minutes unless they specify otherwise.`,
    '',
    'PHASE 1 — IDENTITY (do this first, before any scheduling):',
    name
      ? `- Confirm it is a good time, then verify identity: ask if you are speaking with ${name}.`
      : '- Confirm it is a good time, then ask once for their name.',
    '- Do not discuss interview times until they confirm they are the right person, or they have given a name when none was expected.',
    '- If it is the wrong person, do not congratulate and do not book. Complete with WRONG_PERSON (offer a callback if they volunteer how to reach the right person).',
    '- After they confirm they are the right person (or have given their name when none was expected), congratulate them briefly that they have been selected for the interview — one short sentence. Do not congratulate before identity is confirmed.',
    '',
    'PHASE 2 — BOOK THE INTERVIEW (only after identity is confirmed and you have congratulated):',
    '- Ask for a preferred date and time.',
    '- Resolve relative times using the authoritative call clock in system instructions. Never append Z to a local wall-clock time.',
    '- Use the calendar availability and booking tools you have been given. Check that the proposed window is free before booking.',
    `- If a slot is free, book it with the booking tool (title like “Interview — {name}”, include email when known). Pass the exact start time the availability tool returned when it provides one.`,
    '- NEVER claim the interview is booked unless a booking tool returned ok/success. If tools fail, say so and offer another time or a human callback.',
    '- After a successful book, read back the confirmed time in natural language once.',
    '',
    'COMPLETION:',
    '- When booking is done (or clearly not happening), or identity failed, call complete_interview_booking_task.',
    '- Use BOOKED only when a calendar booking tool returned ok. NOT_BOOKED if no event. WRONG_PERSON if not the expected contact. CALLBACK if they asked to reschedule this call. DECLINED if not interested.',
    '- After complete_interview_booking_task succeeds, the system hangs up automatically — do not also call end_call.',
    '- If they say goodbye or ask to stop mid-flow, prefer completing with the best-fit outcome then hangup; else call end_call.',
    `Runtime context: ${formatContextForInstructions(meta.context)}`,
  ]
    .filter((line) => line !== null)
    .join(' ');
}

/**
 * Workflow: confirm callee identity, then book an interview on the calendar.
 * Persona stays on the parent Agent system prompt. Calendar tools come from the profile.
 */
export const createInterviewBookingTask: TaskFactory = ({
  meta,
  userData,
  tools,
  chatCtx,
}) => {
  const email = contextField(meta.context, 'email', 'participantEmail');
  const expectedName = displayNameFromContext(meta.context);

  const task = voice.AgentTask.create<InterviewBookingResult>({
    instructions: buildInterviewBookingInstructions(meta),
    chatCtx,
    tools: [
      ...tools,
      llm.tool({
        name: 'complete_interview_booking_task',
        description:
          'Mark the interview identity + booking workflow complete. Use BOOKED only when a calendar booking tool returned ok.',
        parameters: z.object({
          outcome: z.enum([
            'BOOKED',
            'NOT_BOOKED',
            'WRONG_PERSON',
            'CALLBACK',
            'DECLINED',
          ]),
          confirmedName: nullishString.describe(
            'Name the callee confirmed (or gave) during identity check',
          ),
          eventId: nullishString.describe(
            'Calendar event / appointment id from the booking tool when booked',
          ),
          scheduledStart: nullishString.describe(
            'Booked start time ISO or natural time string',
          ),
          scheduledEnd: nullishString,
          participantEmail: nullishString,
          notes: nullishString,
        }),
        execute: async (args) =>
          withToolRecording(
            userData,
            'complete_interview_booking_task',
            args,
            async () => {
              const result: InterviewBookingResult = {
                outcome: args.outcome,
                confirmedName: args.confirmedName ?? expectedName,
                eventId: args.eventId ?? undefined,
                scheduledStart: args.scheduledStart ?? undefined,
                scheduledEnd: args.scheduledEnd ?? undefined,
                participantEmail: args.participantEmail ?? email,
                notes: args.notes ?? undefined,
              };
              markTaskFinished(userData, 'interview_booking', result);
              task.complete(result);
              return {
                ok: true,
                ...result,
                message: `Interview booking task complete: ${args.outcome}`,
              };
            },
          ).then((r) => r.message),
      }),
    ],
  });

  return task as unknown as voice.AgentTask<Record<string, unknown>>;
};
