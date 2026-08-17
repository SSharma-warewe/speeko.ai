import { beta } from '@livekit/agents';
import { recordToolEvent } from './tool-events.js';
import type { ToolFactory } from './types.js';

/**
 * Hangup tool via LiveKit createEndCallTool.
 * Records an endCall tool event on invoke (task_complete hangup also records via hangUpCall).
 */
export const createEndCallTool: ToolFactory = ({ userData }) =>
  beta.createEndCallTool({
    deleteRoom: true,
    // Goodbye is spoken in onExit via session.say; avoid a second farewell from tool output.
    endInstructions: null,
    ignoreOnEnter: true,
    extraDescription: [
      'Also call this tool when the person declines the call, is not interested,',
      'asks you to stop calling, says goodbye, or clearly wants to hang up',
      'before the workflow is finished.',
      'Do not wait for further confirmation once hangup intent is clear.',
    ].join(' '),
    onToolCalled: () => {
      // Avoid double row if hangUpCall already recorded endCall.
      const already = userData.toolEvents?.some(
        (e) => e.toolId === 'endCall' || e.toolId === 'end_call',
      );
      if (already) return;
      recordToolEvent(userData, {
        toolId: 'endCall',
        ok: true,
        summary: 'end_call tool invoked',
        args: { reason: 'end_call' },
        result: { ok: true, reason: 'end_call' },
      });
    },
  });
