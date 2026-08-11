import { llm } from '@livekit/agents';
import { z } from 'zod';
import { withToolRecording } from './tool-events.js';
import type { ToolFactory } from './types.js';

/** Stub transfer — production would use LiveKit warm transfer / SIP REFER. */
export const createTransferCallTool: ToolFactory = ({ userData }) =>
  llm.tool({
    name: 'transferCall',
    description:
      'Request a transfer to a human agent or department. Use when the caller needs live assistance.',
    parameters: z.object({
      department: z
        .string()
        .describe('Department or queue to transfer to (e.g. support, billing)'),
      reason: z.string().optional().describe('Why the transfer is needed'),
    }),
    execute: async ({ department, reason }) =>
      withToolRecording(
        userData,
        'transferCall',
        { department, reason: reason ?? null },
        async () => {
          console.log(
            `[tool:transferCall] org=${userData.organizationId ?? 'n/a'} dept=${department}`,
          );
          return {
            ok: true,
            department,
            reason: reason ?? null,
            message: `Transfer to ${department} has been requested. Inform the caller a specialist will assist shortly.`,
          };
        },
      ),
  });
