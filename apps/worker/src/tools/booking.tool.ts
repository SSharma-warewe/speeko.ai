import { llm } from '@livekit/agents';
import { z } from 'zod';
import { withToolRecording } from './tool-events.js';
import type { ToolFactory } from './types.js';

/** Stub booking tool — replace execute body with real booking API later. */
export const createBookingTool: ToolFactory = ({ userData }) =>
  llm.tool({
    name: 'booking',
    description:
      'Create or schedule a booking/appointment for the customer. Use only when the customer has agreed to a specific time.',
    parameters: z.object({
      customerName: z.string().describe('Customer full name'),
      preferredTime: z.string().describe('Preferred appointment time (ISO or natural language)'),
      notes: z.string().optional().describe('Optional booking notes'),
    }),
    execute: async ({ customerName, preferredTime, notes }) =>
      withToolRecording(
        userData,
        'booking',
        { customerName, preferredTime, notes: notes ?? null },
        async () => {
          const bookingId = `bk_${Date.now().toString(36)}`;
          console.log(
            `[tool:booking] org=${userData.organizationId ?? 'n/a'} name=${customerName} time=${preferredTime}`,
          );
          return {
            ok: true,
            bookingId,
            customerName,
            preferredTime,
            notes: notes ?? null,
            message: `Booking ${bookingId} recorded for ${customerName} at ${preferredTime}.`,
          };
        },
      ),
  });
