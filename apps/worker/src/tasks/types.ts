import type { llm, voice } from '@livekit/agents';
import type { ToolContextEntry } from '@livekit/agents';
import type { AgentJobMetadata } from '../job-metadata.js';
import type { SessionUserData } from '../tools/types.js';

export type TaskFactoryContext = {
  meta: AgentJobMetadata;
  userData: SessionUserData;
  /** Tools already resolved from the registry for this call. */
  tools: ToolContextEntry[];
  chatCtx?: llm.ChatContext;
};

/**
 * Build a LiveKit AgentTask for a business workflow.
 * Tasks own objective + completion conditions. Persona is copied into the
 * task prompt via `composeTaskInstructions` (AgentTask replaces the parent).
 */
export type TaskFactory = (
  ctx: TaskFactoryContext,
) => voice.AgentTask<Record<string, unknown>>;
