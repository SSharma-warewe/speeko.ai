import { llm, voice } from '@livekit/agents';
import { z } from 'zod';
import { withToolRecording } from '../tools/tool-events.js';
import { contextField, formatContextForInstructions } from './context-format.js';
import { markTaskFinished, nullishString } from './task-complete.js';
import type { TaskFactory } from './types.js';

export type ConfirmAppointmentResult = {
  outcome: 'CONFIRMED' | 'RESCHEDULED' | 'CANCELLED' | 'NO_ANSWER' | 'DECLINED';
  bookingId?: string;
  newTime?: string;
  notes?: string;
};

/**
 * Workflow: confirm, reschedule, or cancel an existing appointment.
 * Persona (tone/company) comes from the parent Agent system prompt.
 */
export const createConfirmAppointmentTask: TaskFactory = ({
  meta,
  userData,
  tools,
  chatCtx,
}) => {
  const bookingId = contextField(meta.context, 'bookingId', 'booking_id');
  const patientName = contextField(
    meta.context,
    'patientName',
    'customerName',
    'name',
  );
  const appointmentTime = contextField(
    meta.context,
    'appointmentTime',
    'appointment_time',
    'time',
  );

  const task = voice.AgentTask.create<ConfirmAppointmentResult>({
    instructions: [
      'Your objective is to handle an appointment confirmation call.',
      patientName ? `The patient/customer name is ${patientName}.` : null,
      appointmentTime
        ? `The scheduled appointment time is ${appointmentTime}.`
        : null,
      bookingId ? `Booking reference: ${bookingId}.` : null,
      'Confirm it is a good time to talk, state the appointment details, and ask if they can keep it.',
      'If they confirm, record CONFIRMED. If they want another time, record RESCHEDULED with the new time.',
      'If they cancel, record CANCELLED. If they refuse to engage, record DECLINED.',
      'Use available tools to persist booking changes when appropriate.',
      'When the outcome is clear, call complete_appointment_task with the result.',
      'After complete_appointment_task succeeds, the system hangs up automatically — do not also call end_call.',
      'If they say goodbye, decline, or ask to stop before the outcome is clear, call end_call (prefer completing with DECLINED first when possible).',
      `Runtime context: ${formatContextForInstructions(meta.context)}`,
    ]
      .filter(Boolean)
      .join(' '),
    chatCtx,
    tools: [
      ...tools,
      llm.tool({
        name: 'complete_appointment_task',
        description:
          'Mark the appointment workflow complete with a structured outcome.',
        parameters: z.object({
          outcome: z.enum([
            'CONFIRMED',
            'RESCHEDULED',
            'CANCELLED',
            'NO_ANSWER',
            'DECLINED',
          ]),
          bookingId: nullishString,
          newTime: nullishString,
          notes: nullishString,
        }),
        execute: async (args) =>
          withToolRecording(userData, 'complete_appointment_task', args, async () => {
            const result: ConfirmAppointmentResult = {
              outcome: args.outcome,
              bookingId: args.bookingId ?? bookingId,
              newTime: args.newTime ?? undefined,
              notes: args.notes ?? undefined,
            };
            markTaskFinished(userData, 'confirm_appointment', result);
            task.complete(result);
            return {
              ok: true,
              ...result,
              message: `Appointment task complete: ${args.outcome}`,
            };
          }).then((r) => r.message),
      }),
    ],
  });

  return task as unknown as voice.AgentTask<Record<string, unknown>>;
};
