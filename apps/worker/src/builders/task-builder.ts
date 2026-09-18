import type { llm, voice, ToolContextEntry } from '@livekit/agents';
import type { AgentJobMetadata } from '@call-agent/contracts';
import { TaskRegistry } from '../tasks/registry.js';
import type { SessionUserData } from '../tools/types.js';

export function buildTask(
  meta: AgentJobMetadata,
  userData: SessionUserData,
  tools: ToolContextEntry[],
  chatCtx?: llm.ChatContext,
): voice.AgentTask<Record<string, unknown>> {
  return TaskRegistry.create({
    meta,
    userData,
    tools,
    chatCtx,
  });
}
