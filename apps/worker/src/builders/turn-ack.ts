import { isRealtimeLlmModel } from '@call-agent/contracts';
import type { AgentJobMetadata } from '@call-agent/contracts';
import { personaSpeaksHindi } from './prompt-builder.js';

export const HINDI_TURN_ACK = 'जी';
export const ENGLISH_TURN_ACK = 'Okay';

export type TurnAckSession = {
  say: (
    text: string,
    options?: { addToChatCtx?: boolean; allowInterruptions?: boolean },
  ) => unknown;
};

/** Canned ack while the pipeline reply generates. Realtime owns its own VAD. */
export function turnAckLine(meta: AgentJobMetadata): string {
  return personaSpeaksHindi(meta) ? HINDI_TURN_ACK : ENGLISH_TURN_ACK;
}

export function resolveTurnAckSpeech(
  meta: AgentJobMetadata,
  userText: string | null | undefined,
): string | null {
  if (isRealtimeLlmModel(meta.model)) {
    return null;
  }
  if (!(userText ?? '').trim()) {
    return null;
  }
  return turnAckLine(meta);
}

export function userTurnText(message: {
  textContent?: string | null;
  content?: unknown;
}): string {
  if (typeof message.textContent === 'string' && message.textContent.trim()) {
    return message.textContent;
  }
  const content = message.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text: unknown }).text ?? '');
        }
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

/**
 * LiveKit onUserTurnCompleted: speak the ack without awaiting so generateReply
 * starts in parallel. Keep it out of chat history.
 */
export function speakTurnAck(
  session: TurnAckSession,
  meta: AgentJobMetadata,
  userText: string | null | undefined,
): void {
  const line = resolveTurnAckSpeech(meta, userText);
  if (!line) {
    return;
  }
  try {
    session.say(line, { addToChatCtx: false, allowInterruptions: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[agent] turn ack say failed: ${message}`);
  }
}
