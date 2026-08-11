import { llm } from '@livekit/agents';
import { z } from 'zod';
import { withToolRecording } from './tool-events.js';
import type { ToolFactory } from './types.js';

/**
 * Business action to record appointment confirmation in an external system.
 * Task completion outcomes are separate (task complete tools).
 */
export const createConfirmAppointmentTool: ToolFactory = ({ userData }) =>
  llm.tool({
    name: 'confirmAppointment',
    description:
      'Persist appointment confirmation/reschedule/cancel against the booking system.',
    parameters: z.object({
      bookingId: z.string().describe('Booking identifier'),
      outcome: z.enum(['CONFIRMED', 'RESCHEDULED', 'CANCELLED']),
      newTime: z
        .string()
        .optional()
        .describe('New appointment time when rescheduling'),
      notes: z.string().optional(),
    }),
    execute: async ({ bookingId, outcome, newTime, notes }) =>
      withToolRecording(
        userData,
        'confirmAppointment',
        {
          bookingId,
          outcome,
          newTime: newTime ?? null,
          notes: notes ?? null,
        },
        async () => {
          console.log(
            `[tool:confirmAppointment] org=${userData.organizationId ?? 'n/a'} booking=${bookingId} outcome=${outcome}`,
          );
          return {
            ok: true,
            bookingId,
            outcome,
            newTime: newTime ?? null,
            notes: notes ?? null,
            message: `Appointment ${bookingId} marked ${outcome}.`,
          };
        },
      ),
  });
