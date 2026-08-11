import { getJobContext, voice } from '@livekit/agents';
import { recordToolEvent } from './tools/tool-events.js';
import type { SessionUserData } from './tools/types.js';

/** Sessions that already started hangup (idempotent across end_call races). */
const hangupStarted = new WeakSet<object>();

export type HangupOptions = {
  /** Reason string for logs / job shutdown. */
  reason?: string;
  /**
   * Delete the LiveKit room after the session closes so SIP participants drop.
   * Default true (same as createEndCallTool).
   */
  deleteRoom?: boolean;
  /** When set, records an endCall tool event once (task complete / custom hangup). */
  userData?: SessionUserData;
};

/**
 * End the voice session and drop the room (SIP hangup).
 * Idempotent — safe if end_call already started shutdown.
 * Parent agent onExit speaks goodbye; do not generate a second farewell here.
 */
export function hangUpCall(
  session: voice.AgentSession,
  options: HangupOptions = {},
): void {
  const reason = options.reason ?? 'hangup';
  const deleteRoom = options.deleteRoom !== false;

  if (hangupStarted.has(session)) {
    console.log(`[hangup] already in progress reason=${reason}`);
    return;
  }
  hangupStarted.add(session);

  console.log(`[hangup] starting reason=${reason} deleteRoom=${deleteRoom}`);

  if (options.userData) {
    // Avoid duplicate endCall rows if LiveKit end_call tool also recorded.
    const already = options.userData.toolEvents?.some(
      (e) => e.toolId === 'endCall' || e.toolId === 'end_call',
    );
    if (!already) {
      recordToolEvent(options.userData, {
        toolId: 'endCall',
        ok: true,
        summary: reason,
        args: { reason },
        result: { ok: true, reason },
      });
    }
  }

  const onClose = () => {
    const jobCtx = getJobContext(false);
    if (!jobCtx) {
      console.warn('[hangup] no job context after session close');
      return;
    }
    if (deleteRoom) {
      jobCtx.addShutdownCallback(async () => {
        console.log('[hangup] deleting room after call end');
        await jobCtx.deleteRoom();
      });
    }
    jobCtx.shutdown(reason);
  };

  session.once(voice.AgentSessionEventTypes.Close, onClose);

  try {
    session.shutdown({ drain: true, reason });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[hangup] session.shutdown error: ${message}`);
    // Session may already be closed — still try job-level room delete.
    onClose();
  }
}
