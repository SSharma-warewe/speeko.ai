import { isRealtimeLlmModel } from '@call-agent/contracts';
import type { AgentJobMetadata } from '@call-agent/contracts';
import { voice } from '@livekit/agents';
import { personaSpeaksHindi } from './prompt-builder.js';

export const HINDI_TURN_ACK = 'जी';
export const ENGLISH_TURN_ACK = 'Okay';

const ACK_SAY_OPTIONS = {
  addToChatCtx: false,
  allowInterruptions: true,
} as const;

export type TurnAckSession = {
  say: (
    text: string,
    options?: { addToChatCtx?: boolean; allowInterruptions?: boolean },
  ) => unknown;
};

export type EarlyTurnAckSession = TurnAckSession & {
  on(
    event: string,
    listener: (ev: { newState?: string }) => void,
  ): unknown;
};

export type EarlyTurnAckHandle = {
  enable: () => void;
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

/** Pipeline only. No transcript — VAD already decided they spoke. */
export function resolveEarlyTurnAck(meta: AgentJobMetadata): string | null {
  if (isRealtimeLlmModel(meta.model)) {
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

function sayAck(session: TurnAckSession, line: string): void {
  try {
    session.say(line, ACK_SAY_OPTIONS);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[agent] turn ack say failed: ${message}`);
  }
}

/**
 * Speak the ack without awaiting. Keep it out of chat history.
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
  sayAck(session, line);
}

export function speakEarlyTurnAck(
  session: TurnAckSession,
  meta: AgentJobMetadata,
): void {
  const line = resolveEarlyTurnAck(meta);
  if (!line) {
    return;
  }
  console.log(`[agent] turn ack early line=${line}`);
  sayAck(session, line);
}

/**
 * Pipeline: say जी / Okay on user speaking → listening (VAD speech end),
 * not on turn commit. enable() after the opening so we do not talk over it.
 */
export function attachEarlyTurnAck(
  session: EarlyTurnAckSession,
  meta: AgentJobMetadata,
): EarlyTurnAckHandle {
  if (isRealtimeLlmModel(meta.model)) {
    return { enable() {} };
  }

  let enabled = false;
  let heardSpeech = false;

  session.on(
    voice.AgentSessionEventTypes.UserStateChanged,
    (ev) => {
      if (ev.newState === 'speaking') {
        heardSpeech = true;
        return;
      }
      if (ev.newState !== 'listening' || !enabled || !heardSpeech) {
        return;
      }
      heardSpeech = false;
      speakEarlyTurnAck(session, meta);
    },
  );

  return {
    enable() {
      enabled = true;
    },
  };
}
