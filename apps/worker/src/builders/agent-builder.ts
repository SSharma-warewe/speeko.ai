import { voice } from '@livekit/agents';
import { hangUpCall } from '../hangup.js';
import type { AgentJobMetadata } from '../job-metadata.js';
import type { SessionUserData } from '../tools/types.js';
import { buildModels } from './model-builder.js';
import {
  buildClosingSpeech,
  buildOpeningInstructions,
  buildPersonaPrompt,
  hookMode,
  snapshotCallClock,
} from './prompt-builder.js';
import { buildTask } from './task-builder.js';
import { buildTools } from './tool-builder.js';
import { buildAgentSession } from './voice-builder.js';

export type BuiltAgentRuntime = {
  session: voice.AgentSession<SessionUserData>;
  agent: voice.Agent<SessionUserData>;
  userData: SessionUserData;
};

/**
 * Construction path:
 * parse metadata (caller) → build prompt → resolve tools → parent onEnter opens + runs task → onExit says goodbye.
 */
export async function buildAgentRuntime(
  meta: AgentJobMetadata,
): Promise<BuiltAgentRuntime> {
  const userData: SessionUserData = {
    callId: meta.callId,
    organizationId: meta.organizationId,
    taskKey: meta.task,
    context: meta.context ?? {},
    taskResult: null,
    taskCompleted: false,
    toolEvents: [],
  };

  const clock = snapshotCallClock(meta);
  console.log(
    `[agent] clock tz=${clock.timeZone} today=${clock.today.ymd} tomorrow=${clock.tomorrow.ymd} utc=${clock.utcIso}`,
  );
  console.log(
    `[agent] hooks onEnter=${hookMode(meta.prompt.onEnterInstructions)} onExit=${hookMode(meta.prompt.onExitInstructions)}`,
  );

  const models = buildModels(meta);
  console.log(
    `[agent] models kind=${models.kind} llm=${meta.model ?? 'google/gemma-4-31b-it'} ` +
      `tts=${models.kind === 'realtime' ? 'none' : (meta.ttsModel ?? 'inworld/inworld-tts-2')} ` +
      `voice=${meta.voice ?? 'default'}`,
  );
  const tools = await buildTools(meta, userData);
  const instructions = buildPersonaPrompt(meta);
  const session = buildAgentSession(models, userData);

  const agent = voice.Agent.create<SessionUserData>({
    instructions,
    // Parent agent keeps shared capability tools; task adds workflow-complete tools.
    tools,
    async onEnter(ctx) {
      // LiveKit parent onEnter: configurable opening speech, then workflow task.
      try {
        const opening = buildOpeningInstructions(meta);
        if (opening) {
          const prefix = opening.replace(/\s+/g, ' ').slice(0, 80);
          console.log(
            `[agent] onEnter opening mode=${hookMode(meta.prompt.onEnterInstructions)} prefix="${prefix}"`,
          );
          const openHandle = ctx.session.generateReply({
            instructions: opening,
          });
          await openHandle.waitForPlayout();
          console.log(`[agent] onEnter opening playout done callId=${meta.callId ?? 'n/a'}`);
        } else {
          console.log('[agent] onEnter silent (no opening speech)');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[agent] onEnter opening failed: ${message}`);
      }

      try {
        const task = buildTask(
          meta,
          userData,
          tools,
          // Drop parent system prompt from history — tasks re-attach it via
          // composeTaskInstructions so it is not duplicated.
          ctx.agent.chatCtx.copy({ excludeInstructions: true }),
        );
        const result = await task.run();
        userData.taskCompleted = true;
        if (result && typeof result === 'object') {
          userData.taskResult = {
            task: meta.task,
            ...(result as Record<string, unknown>),
          };
        }
        console.log(
          `[agent] task complete key=${meta.task} result=${JSON.stringify(userData.taskResult)}`,
        );
        // Workflow done → hang up (goodbye via onExit say(); room delete drops SIP).
        hangUpCall(ctx.session, { reason: 'task_complete', userData });
      } catch (err) {
        // Task may be interrupted by end_call / shutdown — keep partial result.
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[agent] task ended with error key=${meta.task}: ${message}`);
      }
    },
    async onExit(ctx) {
      // LiveKit parent onExit: speak the hook text verbatim (no second LLM turn).
      try {
        const closing = buildClosingSpeech(meta);
        if (!closing) {
          console.log('[agent] onExit silent (no closing speech)');
          return;
        }
        const prefix = closing.replace(/\s+/g, ' ').slice(0, 80);
        console.log(
          `[agent] onExit say mode=${hookMode(meta.prompt.onExitInstructions)} prefix="${prefix}"`,
        );
        const handle = ctx.session.say(closing, { allowInterruptions: false });
        await handle.waitForPlayout();
      } catch {
        // Session may already be closing (callee hangup).
      }
    },
  });

  return { session, agent, userData };
}
