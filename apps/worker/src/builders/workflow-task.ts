import { isRealtimeLlmModel } from '@call-agent/contracts';
import type { llm, ToolContextEntry } from '@livekit/agents';
import { voice } from '@livekit/agents';
import type { AgentJobMetadata } from '../job-metadata.js';
import {
  speakRealtimeGoodbye,
  speakRealtimeOpening,
} from './realtime-speech.js';

/**
 * AgentTask with realtime speech hooks:
 * - onEnter generateReplys the opening after handoff (parent stays silent)
 * - finishWorkflowTask speaks goodbye while the task is still current
 */
export function createWorkflowTask<ResultT>(
  meta: AgentJobMetadata,
  options: {
    instructions: string;
    chatCtx?: llm.ChatContext;
    tools: ToolContextEntry[];
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
  });
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
