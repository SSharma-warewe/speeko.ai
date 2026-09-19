import { isRealtimeLlmModel } from '@call-agent/contracts';
import type { llm, ToolContextEntry } from '@livekit/agents';
import { voice } from '@livekit/agents';
import type { AgentJobMetadata } from '@call-agent/contracts';
import type { SessionUserData } from '../tools/types.js';
import {
  classifyInboundServiceTrack,
  inboundServiceTrackLine,
} from './inbound-service-tracks.js';
import {
  speakRealtimeGoodbye,
  speakRealtimeOpening,
} from './realtime-speech.js';
import { sayCached } from './tts-cache.js';
import { userTurnText } from './turn-ack.js';

/**
 * AgentTask with speech hooks:
 * - onEnter generateReplys the opening after handoff (parent stays silent)
 * - pipeline जी / Okay is session UserStateChanged (speaking → listening), not here
 * - inbound first service answer may be a cached session.say + StopResponse
 * - finishWorkflowTask speaks goodbye while the task is still current
 */
export function createWorkflowTask<ResultT>(
  meta: AgentJobMetadata,
  options: {
    instructions: string;
    chatCtx?: llm.ChatContext;
    tools: ToolContextEntry[];
    userData?: SessionUserData;
  },
): voice.AgentTask<ResultT> {
  const realtime = isRealtimeLlmModel(meta.model);
  return voice.AgentTask.create<ResultT>({
    instructions: options.instructions,
    chatCtx: options.chatCtx,
    tools: options.tools,
    async onEnter(ctx) {
      if (!realtime) {
        return;
      }
      await speakRealtimeOpening(ctx.session, meta);
    },
    async onUserTurnCompleted(...args: unknown[]) {
      if (realtime) {
        return;
      }
      const session = sessionFromTurnArgs(args);
      const message = messageFromTurnArgs(args);
      if (!session || !options.userData) {
        return;
      }
      await handleInboundServiceTrackTurn({
        session,
        meta,
        userData: options.userData,
        userText: userTurnText(message),
      });
    },
  });
}

type TrackTurnSession = {
  interrupt?: () => void;
  say: (
    text: string,
    options?: { addToChatCtx?: boolean; allowInterruptions?: boolean },
  ) => unknown;
};

export async function handleInboundServiceTrackTurn(options: {
  session: TrackTurnSession;
  meta: AgentJobMetadata;
  userData: SessionUserData;
  userText: string;
}): Promise<void> {
  if (isRealtimeLlmModel(options.meta.model)) {
    return;
  }
  if (options.meta.direction !== 'inbound') {
    return;
  }
  if (options.userData.serviceTrack) {
    return;
  }
  const track = classifyInboundServiceTrack(options.userText);
  if (!track) {
    return;
  }
  const line = inboundServiceTrackLine(track);
  options.userData.serviceTrack = track;
  console.log(`[agent] inbound service track=${track} line=${line}`);
  try {
    options.session.interrupt?.();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[agent] inbound track interrupt failed: ${message}`);
  }
  sayCached(
    options.session,
    options.userData.tts,
    line,
    { addToChatCtx: true, allowInterruptions: true },
    options.meta,
  );
  throw new voice.StopResponse();
}

function sessionFromTurnArgs(args: unknown[]): TrackTurnSession | null {
  for (const arg of args) {
    if (!arg || typeof arg !== 'object') {
      continue;
    }
    const rec = arg as { session?: TrackTurnSession };
    if (rec.session && typeof rec.session.say === 'function') {
      return rec.session;
    }
    if (typeof (arg as TrackTurnSession).say === 'function') {
      return arg as TrackTurnSession;
    }
  }
  return null;
}

function messageFromTurnArgs(args: unknown[]): {
  textContent?: string | null;
  content?: unknown;
} {
  for (const arg of args) {
    if (!arg || typeof arg !== 'object') {
      continue;
    }
    const rec = arg as { textContent?: unknown; content?: unknown; role?: unknown };
    if (
      typeof rec.textContent === 'string' ||
      rec.content !== undefined ||
      rec.role === 'user'
    ) {
      return {
        textContent:
          typeof rec.textContent === 'string' ? rec.textContent : null,
        content: rec.content,
      };
    }
  }
  return {};
}

/**
 * Realtime: goodbye generateReply on the task, then complete.
 * Pipeline: complete immediately (parent onExit session.say plays the close).
 * Never throws past goodbye failures — complete still runs.
 */
export async function finishWorkflowTask<ResultT>(
  task: voice.AgentTask<ResultT>,
  meta: AgentJobMetadata,
  result: ResultT,
): Promise<void> {
  if (isRealtimeLlmModel(meta.model)) {
    try {
      await speakRealtimeGoodbye(task.session, meta);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[agent] realtime task goodbye failed: ${message}`);
    }
  }
  task.complete(result);
}
