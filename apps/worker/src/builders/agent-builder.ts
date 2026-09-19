import { isRealtimeLlmModel } from '@call-agent/contracts';
import { voice } from '@livekit/agents';
import { hangUpCall } from '../hangup.js';
import type { AgentJobMetadata } from '@call-agent/contracts';
import { resolveSarvamRealtimePluginUrl } from '../sarvam/plugin-stt.js';
import type { SessionUserData } from '../tools/types.js';
import { inboundServiceTrackLines } from './inbound-service-tracks.js';
import { buildModels, resolveSttSpec } from './model-builder.js';
import {
  buildClosingSpeech,
  buildOpeningInstructions,
  buildPersonaPrompt,
  cannedClosingLine,
  hookMode,
  shouldParentSpeakOpening,
  snapshotCallClock,
} from './prompt-builder.js';
import { buildTask } from './task-builder.js';
import { buildTools } from './tool-builder.js';
import { sayCached, warmTtsPhrases, type TtsSynthesizer } from './tts-cache.js';
import {
  attachEarlyTurnAck,
  turnAckLine,
  type EarlyTurnAckHandle,
} from './turn-ack.js';
import { buildAgentSession } from './voice-builder.js';

export type BuiltAgentRuntime = {
  session: voice.AgentSession<SessionUserData>;
  agent: voice.Agent<SessionUserData>;
  userData: SessionUserData;
};

type AgentHookContext = voice.AgentContext<SessionUserData>;
type AgentTools = Awaited<ReturnType<typeof buildTools>>;

/**
 * Construction path:
 * parse metadata (caller) → build prompt → resolve tools → parent onEnter opens + runs task → onExit says goodbye.
 */
export class AgentRuntimeBuilder {
  private earlyTurnAck: EarlyTurnAckHandle | null = null;
  private tts: TtsSynthesizer | undefined;

  constructor(private readonly meta: AgentJobMetadata) {}

  async build(): Promise<BuiltAgentRuntime> {
    const userData = this.createUserData();
    this.logCallInfo();

    const models = buildModels(this.meta);
    this.logModelInfo(models);
    if (models.kind === 'pipeline') {
      this.tts = models.tts;
      userData.tts = models.tts;
    }

    const tools = await buildTools(this.meta, userData);
    const session = buildAgentSession(models, userData, {
      medium: this.meta.medium,
    });
    this.earlyTurnAck = attachEarlyTurnAck(session, this.meta, this.tts);
    const agent = this.createAgent(userData, tools);

    return { session, agent, userData };
  }

  private createUserData(): SessionUserData {
    return {
      callId: this.meta.callId,
      organizationId: this.meta.organizationId,
      taskKey: this.meta.task,
      context: this.meta.context ?? {},
      taskResult: null,
      taskCompleted: false,
      toolEvents: [],
    };
  }

  private logCallInfo(): void {
    const clock = snapshotCallClock(this.meta);
    console.log(
      `[agent] clock tz=${clock.timeZone} today=${clock.today.ymd} tomorrow=${clock.tomorrow.ymd} utc=${clock.utcIso}`,
    );
    console.log(
      `[agent] hooks onEnter=${hookMode(this.meta.prompt.onEnterInstructions)} onExit=${hookMode(this.meta.prompt.onExitInstructions)}`,
    );
  }

  private logModelInfo(models: ReturnType<typeof buildModels>): void {
    const sttId =
      models.kind === 'realtime' ? 'none' : (this.meta.sttModel ?? 'deepgram/nova-3');
    const sttPlugin =
      models.kind !== 'realtime' && resolveSttSpec(this.meta).realtime
        ? resolveSarvamRealtimePluginUrl()
          ? 'python'
          : 'node-adapter'
        : null;
    console.log(
      `[agent] models kind=${models.kind} llm=${this.meta.model ?? 'google/gemma-4-31b-it'} ` +
        `stt=${sttId}${sttPlugin ? ` plugin=${sttPlugin}` : ''} ` +
        `tts=${models.kind === 'realtime' ? 'none' : (this.meta.ttsModel ?? 'inworld/inworld-tts-2')} ` +
        `voice=${this.meta.voice ?? 'default'} lang=${this.meta.speechLanguage ?? 'default'}`,
    );
  }

  private async playOpening(ctx: AgentHookContext): Promise<void> {
    // Pipeline: parent greets then AgentTask.run() replaces it.
    // Realtime: skip parent generateReply — handoff abandons in-flight
    // audio (waitForPlayout returns before playout). Task onEnter greets.
    try {
      if (!shouldParentSpeakOpening(this.meta)) {
        console.log(
          `[agent] onEnter realtime: skip parent opening; task greets callId=${this.meta.callId ?? 'n/a'}`,
        );
        return;
      }
      const opening = buildOpeningInstructions(this.meta);
      if (opening) {
        const prefix = opening.replace(/\s+/g, ' ').slice(0, 80);
        console.log(
          `[agent] onEnter opening mode=${hookMode(this.meta.prompt.onEnterInstructions)} prefix="${prefix}"`,
        );
        const openHandle = ctx.session.generateReply({
          instructions: opening,
          toolChoice: 'none',
          // Default barge-in (500ms / 0 words) chops TTS on Deepgram
          // ghosts and a callee "hello"; waitForPlayout then returns and
          // the task re-greets. Keep overlapping audio for the next turn
          // (pipeline discardAudioIfUninterruptible: false).
          allowInterruptions: false,
        });
        void warmTtsPhrases(this.tts, this.meta, phrasesToWarm(this.meta));
        await openHandle.waitForPlayout();
        console.log(
          `[agent] onEnter opening playout done callId=${this.meta.callId ?? 'n/a'}`,
        );
      } else {
        console.log('[agent] onEnter silent (no opening speech)');
        void warmTtsPhrases(this.tts, this.meta, phrasesToWarm(this.meta));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[agent] onEnter opening failed: ${message}`);
    } finally {
      this.earlyTurnAck?.enable();
    }
  }

  private async handleEnter(
    ctx: AgentHookContext,
    userData: SessionUserData,
    tools: AgentTools,
  ): Promise<void> {
    await this.playOpening(ctx);

    try {
      const task = buildTask(
        this.meta,
        userData,
        tools,
        // Drop parent system prompt from history — tasks re-attach it via
        // composeTaskInstructions so it is not duplicated.
        ctx.agent.chatCtx.copy({
          excludeInstructions: true,
          excludeConfigUpdate: true,
          excludeHandoff: true,
        }),
      );
      const result = await task.run();
      userData.taskCompleted = true;
      if (result && typeof result === 'object') {
        userData.taskResult = {
          task: this.meta.task,
          ...(result as Record<string, unknown>),
        };
      }
      console.log(
        `[agent] task complete key=${this.meta.task} result=${JSON.stringify(userData.taskResult)}`,
      );
      // Realtime goodbye already played on the task before complete().
      // Pipeline: hang up immediately; onExit session.say plays the canned line.
      hangUpCall(ctx.session, { reason: 'task_complete', userData });
    } catch (err) {
      // Task may be interrupted by end_call / shutdown — keep partial result.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[agent] task ended with error key=${this.meta.task}: ${message}`);
    }
  }

  private async playClosing(ctx: AgentHookContext): Promise<void> {
    // LiveKit parent onExit: speak the hook text verbatim (no second LLM turn).
    try {
      const closing = buildClosingSpeech(this.meta);
      if (!closing) {
        console.log('[agent] onExit silent (no closing speech)');
        return;
      }
      const prefix = closing.replace(/\s+/g, ' ').slice(0, 80);
      console.log(
        `[agent] onExit say mode=${hookMode(this.meta.prompt.onExitInstructions)} prefix="${prefix}"`,
      );
      const handle = sayCached(
        ctx.session,
        this.tts,
        closing,
        { allowInterruptions: false },
        this.meta,
      ) as { waitForPlayout?: () => Promise<void> };
      await handle.waitForPlayout?.();
    } catch {
      // Session may already be closing (callee hangup).
    }
  }

  private createAgent(
    userData: SessionUserData,
    tools: AgentTools,
  ): voice.Agent<SessionUserData> {
    const instructions = buildPersonaPrompt(this.meta);
    return voice.Agent.create<SessionUserData>({
      instructions,
      // Parent agent keeps shared capability tools; task adds workflow-complete tools.
      tools,
      onEnter: async (ctx) => {
        await this.handleEnter(ctx, userData, tools);
      },
      onExit: async (ctx) => {
        await this.playClosing(ctx);
      },
    });
  }
}

export function phrasesToWarm(meta: AgentJobMetadata): string[] {
  if (isRealtimeLlmModel(meta.model)) {
    return [];
  }
  const phrases: string[] = [];
  if (meta.direction === 'inbound') {
    phrases.push(...inboundServiceTrackLines());
  }
  phrases.push(turnAckLine(meta));
  const closing = cannedClosingLine(meta);
  if (closing) {
    phrases.push(closing);
  }
  return [...new Set(phrases)];
}

export async function buildAgentRuntime(
  meta: AgentJobMetadata,
): Promise<BuiltAgentRuntime> {
  return new AgentRuntimeBuilder(meta).build();
}
