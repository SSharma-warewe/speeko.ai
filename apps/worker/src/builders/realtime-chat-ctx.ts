import { llm } from '@livekit/agents';

/**
 * OpenAI / xAI Realtime `livekitItemToOpenAIItem` throws on LiveKit-only
 * chat items (`agent_config_update`, `agent_handoff`). AgentTask.run()
 * inserts those when it replaces the parent agent.
 */
export function stripRealtimeUnsupportedChatItems(
  chatCtx: llm.ChatContext,
): llm.ChatContext {
  return chatCtx.copy({
    excludeConfigUpdate: true,
    excludeHandoff: true,
  });
}
