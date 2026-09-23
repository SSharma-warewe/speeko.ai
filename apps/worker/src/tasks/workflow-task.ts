import { isRealtimeLlmModel } from '@call-agent/contracts';
import type { llm, ToolContextEntry } from '@livekit/agents';
import { voice } from '@livekit/agents';
import type { AgentJobMetadata } from '@call-agent/contracts';
import type { SessionUserData } from '../tools/types.js';
import {
  buildOpeningInstructions,
  buildRealtimeClosingInstructions,
  hookMode,
} from '../builders/prompt-builder.js';
import {
  speakRealtimeGoodbye,
  speakRealtimeOpening,
} from '../speech/realtime-speech.js';
import { personaSpeaksHindi } from '../common/persona.js';
import { sayCached } from '../speech/tts-cache.js';
import { isUnusableUserTurn, userTurnText } from './user-turn.js';
import {
  classifyDemoGoodTime,
  demoAskWhenLine,
  demoCallbackLine,
  isOutboundDemoPipeline,
  resolveDemoScriptStep,
} from './demo-booking-tracks.js';
import {
  classifyInboundBhkBudget,
  classifyInboundLocation,
  classifyInboundServiceTrack,
  classifyInboundTiming,
  inboundLocationFollowUpLine,
  inboundLocationNextStep,
  inboundServiceTrackLine,
  INBOUND_BHK_BUDGET_LINE,
  INBOUND_BUDGET_ONLY_LINE,
  INBOUND_LOCATION_CLARIFY_LINE,
  INBOUND_TIMING_CLARIFY_LINE,
  type InboundScriptStep,
} from './inbound-service-tracks.js';

/**
 * AgentTask with speech hooks:
 * - onEnter generateReplys the opening after handoff (parent stays silent)
 * - pipeline जी / Okay is session UserStateChanged (speaking → listening), not here
 * - inbound script may cache location → timing → BHK/budget via session.say + StopResponse
 * - outbound demo_booking may cache good-time / callback via session.say + StopResponse
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
      await speakRealtimeOpening(ctx.session, {
        instructions: buildOpeningInstructions(meta),
        hookMode: hookMode(meta.prompt.onEnterInstructions),
      });
    },
    async onUserTurnCompleted(ctx, chatCtx, newMessage) {
      if (realtime) {
        return;
      }
      await runInboundScriptHook({
        ctx,
        chatCtx,
        newMessage,
        meta,
        userData: options.userData,
      });
      await runDemoBookingScriptHook({
        ctx,
        chatCtx,
        newMessage,
        meta,
        userData: options.userData,
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

export type InboundTurnHookArgs = {
  session: TrackTurnSession | null;
  userText: string;
};

const LOG_TEXT_MAX = 80;

/**
 * Official LiveKit args: onUserTurnCompleted(ctx, chatCtx, newMessage).
 * Prefer ctx.session; last-resort fallback is a say() object on ctx itself.
 * Do not scan chatCtx for the user utterance.
 */
export function resolveInboundTurnHookArgs(
  ctx: unknown,
  _chatCtx: unknown,
  newMessage: unknown,
): InboundTurnHookArgs {
  return {
    session: sessionFromOfficialCtx(ctx),
    userText: userTurnText(asTurnMessage(newMessage)),
  };
}

export async function runInboundScriptHook(options: {
  ctx: unknown;
  chatCtx?: unknown;
  newMessage: unknown;
  meta: AgentJobMetadata;
  userData?: SessionUserData;
}): Promise<void> {
  const { session, userText } = resolveInboundTurnHookArgs(
    options.ctx,
    options.chatCtx,
    options.newMessage,
  );
  const inboundPipeline =
    options.meta.direction === 'inbound' &&
    !isRealtimeLlmModel(options.meta.model);
  if (inboundPipeline) {
    const step = options.userData
      ? resolveInboundScriptStep(options.userData)
      : 'service';
    const track = options.userData?.serviceTrack ?? 'none';
    console.log(
      `[agent] inbound script hook step=${step} track=${track} ` +
        `text="${truncateLogText(userText)}" session=${session ? 'ok' : 'missing'}`,
    );
    if (!options.userData) {
      console.log('[agent] inbound script skip=no-userData');
    } else if (!session) {
      console.log('[agent] inbound script skip=no-session');
    }
  }
  if (!session || !options.userData) {
    return;
  }
  await handleInboundServiceTrackTurn({
    session,
    meta: options.meta,
    userData: options.userData,
    userText,
  });
}

export async function runDemoBookingScriptHook(options: {
  ctx: unknown;
  chatCtx?: unknown;
  newMessage: unknown;
  meta: AgentJobMetadata;
  userData?: SessionUserData;
}): Promise<void> {
  const { session, userText } = resolveInboundTurnHookArgs(
    options.ctx,
    options.chatCtx,
    options.newMessage,
  );
  const demoPipeline = isOutboundDemoPipeline(options.meta);
  if (demoPipeline) {
    const step = options.userData
      ? resolveDemoScriptStep(options.userData)
      : 'good_time';
    console.log(
      `[agent] demo script hook step=${step} ` +
        `text="${truncateLogText(userText)}" session=${session ? 'ok' : 'missing'}`,
    );
    if (!options.userData) {
      console.log('[agent] demo script skip=no-userData');
    } else if (!session) {
      console.log('[agent] demo script skip=no-session');
    }
  }
  if (!session || !options.userData) {
    return;
  }
  await handleDemoBookingTurn({
    session,
    meta: options.meta,
    userData: options.userData,
    userText,
  });
}

export async function handleDemoBookingTurn(options: {
  session: TrackTurnSession;
  meta: AgentJobMetadata;
  userData: SessionUserData;
  userText: string;
}): Promise<void> {
  if (!isOutboundDemoPipeline(options.meta)) {
    return;
  }
  const step = resolveDemoScriptStep(options.userData);
  if (step === 'done') {
    console.log('[agent] demo script skip=done');
    return;
  }
  const kind = classifyDemoGoodTime(options.userText, {
    hindiHanHomophone: personaSpeaksHindi(options.meta),
  });
  if (step === 'good_time') {
    if (kind === 'yes') {
      options.userData.demoScriptStep = 'ask_when';
      console.log('[agent] demo script step=ask_when kind=yes');
      speakCachedScriptLine(options, demoAskWhenLine(options.meta));
    }
    if (kind === 'callback') {
      options.userData.demoScriptStep = 'done';
      console.log('[agent] demo script step=done kind=callback');
      speakCachedScriptLine(options, demoCallbackLine(options.meta));
    }
    if (kind === 'declined') {
      options.userData.demoScriptStep = 'done';
      console.log('[agent] demo script step=done leave-to-llm kind=declined');
      return;
    }
    if (!kind && !isUnusableUserTurn(options.userText)) {
      options.userData.demoScriptStep = 'done';
      console.log('[agent] demo script step=done leave-to-llm kind=content');
    }
    return;
  }
  if (kind === 'callback') {
    options.userData.demoScriptStep = 'done';
    console.log('[agent] demo script step=done kind=callback');
    speakCachedScriptLine(options, demoCallbackLine(options.meta));
  }
  if (kind === 'declined') {
    options.userData.demoScriptStep = 'done';
    console.log('[agent] demo script step=done leave-to-llm kind=declined');
    return;
  }
  options.userData.demoScriptStep = 'done';
  console.log('[agent] demo script step=done leave-to-llm kind=ask_when');
}

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
  const step = resolveInboundScriptStep(options.userData);
  if (step === 'done') {
    console.log('[agent] inbound script skip=done');
    return;
  }
  if (step === 'service') {
    const track = classifyInboundServiceTrack(options.userText);
    if (!track) {
      console.log(
        `[agent] inbound script skip=no-track text="${truncateLogText(options.userText)}"`,
      );
      return;
    }
    options.userData.serviceTrack = track;
    options.userData.inboundScriptStep = 'location';
    const line = inboundServiceTrackLine(track);
    console.log(`[agent] inbound service track=${track} line=${line}`);
    speakCachedScriptLine(options, line);
    return;
  }
  if (step === 'location') {
    const location = classifyInboundLocation(options.userText);
    if (location) {
      const next = inboundLocationNextStep(options.userData.serviceTrack);
      const line = inboundLocationFollowUpLine(options.userData.serviceTrack);
      options.userData.inboundScriptStep = next;
      console.log(
        `[agent] inbound script step=${next} location=${location}`,
      );
      speakCachedScriptLine(options, line);
      return;
    }
    console.log('[agent] inbound script step=location location=miss');
    speakCachedScriptLine(options, INBOUND_LOCATION_CLARIFY_LINE);
    return;
  }
  if (step === 'timing') {
    const timing = classifyInboundTiming(options.userText);
    if (timing) {
      options.userData.inboundScriptStep = 'bhk_budget';
      console.log(`[agent] inbound script step=bhk_budget timing=${timing}`);
      speakCachedScriptLine(options, INBOUND_BHK_BUDGET_LINE);
      return;
    }
    console.log('[agent] inbound script step=timing timing=miss');
    speakCachedScriptLine(options, INBOUND_TIMING_CLARIFY_LINE);
    return;
  }
  const kind = classifyInboundBhkBudget(options.userText);
  if (kind === 'bhk') {
    options.userData.inboundScriptStep = 'done';
    console.log('[agent] inbound script step=done bhk=only');
    speakCachedScriptLine(options, INBOUND_BUDGET_ONLY_LINE);
    return;
  }
  if (kind === 'budget' || kind === 'both' || kind === 'refuse') {
    options.userData.inboundScriptStep = 'done';
    console.log(`[agent] inbound script step=done leave-to-llm kind=${kind}`);
  }
}

function resolveInboundScriptStep(
  userData: SessionUserData,
): InboundScriptStep {
  if (userData.inboundScriptStep) {
    return userData.inboundScriptStep;
  }
  if (userData.serviceTrack) {
    return 'location';
  }
  return 'service';
}

function speakCachedScriptLine(
  options: {
    session: TrackTurnSession;
    meta: AgentJobMetadata;
    userData: SessionUserData;
  },
  line: string,
): never {
  try {
    options.session.interrupt?.();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[agent] script interrupt failed: ${message}`);
  }
  try {
    sayCached(
      options.session,
      options.userData.tts,
      line,
      { addToChatCtx: true, allowInterruptions: true },
      options.meta,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[agent] script say failed: ${message}`);
    throw err;
  }
  throw new voice.StopResponse();
}

function sessionFromOfficialCtx(ctx: unknown): TrackTurnSession | null {
  if (!ctx || typeof ctx !== 'object') {
    return null;
  }
  const rec = ctx as { session?: unknown };
  if (isTrackTurnSession(rec.session)) {
    return rec.session;
  }
  if (isTrackTurnSession(ctx)) {
    return ctx;
  }
  return null;
}

function isTrackTurnSession(value: unknown): value is TrackTurnSession {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as TrackTurnSession).say === 'function'
  );
}

function asTurnMessage(newMessage: unknown): {
  textContent?: string | null;
  content?: unknown;
} {
  if (!newMessage || typeof newMessage !== 'object') {
    return {};
  }
  const rec = newMessage as { textContent?: unknown; content?: unknown };
  return {
    textContent: typeof rec.textContent === 'string' ? rec.textContent : null,
    content: rec.content,
  };
}

export function truncateLogText(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= LOG_TEXT_MAX) {
    return oneLine;
  }
  return `${oneLine.slice(0, LOG_TEXT_MAX)}…`;
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
      await speakRealtimeGoodbye(task.session, {
        instructions: buildRealtimeClosingInstructions(meta),
        hookMode: hookMode(meta.prompt.onExitInstructions),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[agent] realtime task goodbye failed: ${message}`);
    }
  }
  task.complete(result);
}
