import { voice } from '@livekit/agents';
import type { AgentJobMetadata } from '../job-metadata.js';
import {
  buildOpeningInstructions,
  buildRealtimeClosingInstructions,
  hookMode,
} from './prompt-builder.js';

export const REALTIME_GOODBYE_MIN_MS = 1500;
export const REALTIME_GOODBYE_TIMEOUT_MS = 8000;
export const REALTIME_OPENING_TIMEOUT_MS = 15000;
export const REALTIME_SPEAKING_START_MS = 2000;

const AGENT_STATE_CHANGED = voice.AgentSessionEventTypes.AgentStateChanged;

export type RealtimeWaitSession = {
  agentState: string;
  on(
    event: string,
    listener: (ev: { newState?: string }) => void,
  ): unknown;
  off?(
    event: string,
    listener: (ev: { newState?: string }) => void,
  ): unknown;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function isRealtimeAgentBusy(state: string): boolean {
  return state === 'speaking' || state === 'thinking';
}

export function isRealtimeAgentIdle(state: string): boolean {
  return state === 'idle' || state === 'listening';
}

/**
 * waitForPlayout() returns in ~0.5s on xAI realtime without audio finishing.
 * Wait until the session is speaking/thinking, then back to idle/listening,
 * with a minimum wall time so a one-liner can play.
 */
export async function waitForRealtimeUtterance(
  session: RealtimeWaitSession,
  options: {
    minMs?: number;
    timeoutMs?: number;
    speakingStartMs?: number;
  } = {},
): Promise<'idle' | 'timeout'> {
  const minMs = options.minMs ?? REALTIME_GOODBYE_MIN_MS;
  const timeoutMs = options.timeoutMs ?? REALTIME_GOODBYE_TIMEOUT_MS;
  const speakingStartMs = options.speakingStartMs ?? REALTIME_SPEAKING_START_MS;
  const started = Date.now();
  const deadline = started + timeoutMs;

  const remaining = () => Math.max(0, deadline - Date.now());

  await waitForAgentState(session, isRealtimeAgentBusy, Math.min(speakingStartMs, remaining()));
  const becameIdle = await waitForAgentState(
    session,
    isRealtimeAgentIdle,
    remaining(),
  );

  const elapsed = Date.now() - started;
  if (elapsed < minMs) {
    await sleep(minMs - elapsed);
  }

  return becameIdle || isRealtimeAgentIdle(session.agentState) ? 'idle' : 'timeout';
}

function waitForAgentState(
  session: RealtimeWaitSession,
  predicate: (state: string) => boolean,
  ms: number,
): Promise<boolean> {
  if (predicate(session.agentState)) {
    return Promise.resolve(true);
  }
  if (ms <= 0) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      session.off?.(AGENT_STATE_CHANGED, onChange);
      resolve(ok);
    };
    const onChange = (ev: { newState?: string }) => {
      const state = typeof ev?.newState === 'string' ? ev.newState : session.agentState;
      if (predicate(state)) {
        finish(true);
      }
    };
    const timer = setTimeout(() => finish(false), ms);
    session.on(AGENT_STATE_CHANGED, onChange);
  });
}

export type RealtimeSpeechSession = RealtimeWaitSession & {
  generateReply: (options: {
    instructions: string;
    toolChoice?: 'auto' | 'none' | 'required';
    allowInterruptions?: boolean;
  }) => unknown;
};

/**
 * First spoken turn on realtime after AgentTask handoff.
 * Parent generateReply is skipped (handoff abandons in-flight audio).
 * Never throws — the task still runs if opening speech fails.
 */
export async function speakRealtimeOpening(
  session: RealtimeSpeechSession,
  meta: AgentJobMetadata,
): Promise<void> {
  const instructions = buildOpeningInstructions(meta);
  if (!instructions) {
    console.log('[agent] realtime task opening skipped (silent onEnter)');
    return;
  }
  const prefix = instructions.replace(/\s+/g, ' ').slice(0, 80);
  try {
    console.log(
      `[agent] onEnter realtime: task opening mode=${hookMode(meta.prompt.onEnterInstructions)} prefix="${prefix}"`,
    );
    session.generateReply({
      instructions,
      toolChoice: 'none',
    });
    const wait = await waitForRealtimeUtterance(session, {
      timeoutMs: REALTIME_OPENING_TIMEOUT_MS,
    });
    console.log(`[agent] realtime task opening wait=${wait}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[agent] realtime task opening failed: ${message}`);
  }
}

/**
 * Spoken goodbye on realtime while the task is still the active agent.
 * session.say is skipped on native realtime. Never throws.
 */
export async function speakRealtimeGoodbye(
  session: RealtimeSpeechSession,
  meta: AgentJobMetadata,
): Promise<void> {
  const instructions = buildRealtimeClosingInstructions(meta);
  if (!instructions) {
    console.log('[agent] realtime goodbye skipped (silent onExit)');
    return;
  }
  const line = instructions.replace(/\s+/g, ' ').slice(0, 80);
  try {
    console.log(
      `[agent] realtime goodbye generateReply mode=${hookMode(meta.prompt.onExitInstructions)} prefix="${line}"`,
    );
    session.generateReply({
      instructions,
      toolChoice: 'none',
    });
    const wait = await waitForRealtimeUtterance(session);
    console.log(`[agent] realtime goodbye wait=${wait}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[agent] realtime goodbye failed: ${message}`);
  }
}
