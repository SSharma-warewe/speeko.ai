import { llm } from '@livekit/agents';
import { z } from 'zod';
import { withToolRecording } from './tool-events.js';
import type { ToolFactory } from './types.js';

export const createCancelBookingTool: ToolFactory = ({ userData }) =>
  llm.tool({
    name: 'cancelBooking',
    description: 'Cancel an existing booking or appointment by id or reference.',
    parameters: z.object({
      bookingId: z.string().describe('Booking identifier to cancel'),
      reason: z.string().optional().describe('Optional cancellation reason'),
    }),
    execute: async ({ bookingId, reason }) =>
      withToolRecording(
        userData,
        'cancelBooking',
        { bookingId, reason: reason ?? null },
        async () => {
          console.log(
            `[tool:cancelBooking] org=${userData.organizationId ?? 'n/a'} bookingId=${bookingId}`,
          );
          return {
            ok: true,
            bookingId,
            reason: reason ?? null,
            message: `Booking ${bookingId} has been cancelled.`,
          };
        },
      ),
  });
