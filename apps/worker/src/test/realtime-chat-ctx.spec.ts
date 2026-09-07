import { llm } from '@livekit/agents';
import { stripRealtimeUnsupportedChatItems } from '../builders/realtime-chat-ctx';
import {
  SpeekoOpenaiRealtimeModel,
  SpeekoXaiRealtimeModel,
} from '../builders/realtime-models';
import {
  XAI_REALTIME_TURN_DETECTION,
  createRealtimeLlm,
} from '../builders/model-builder';
import type { AgentJobMetadata } from '../job-metadata';

function meta(overrides: Partial<AgentJobMetadata> = {}): AgentJobMetadata {
  return {
    agentKey: 'outbound',
    direction: 'outbound',
    task: 'general',
    prompt: { systemPrompt: 'You are a test agent.' },
    enabledTools: ['endCall'],
    ...overrides,
  };
}

describe('stripRealtimeUnsupportedChatItems', () => {
  it('drops agent_config_update and agent_handoff, keeps messages', () => {
    const chatCtx = new llm.ChatContext([
      llm.ChatMessage.create({
        id: 'm1',
        role: 'user',
        content: ['hello'],
      }),
      llm.AgentConfigUpdate.create({
        id: 'cfg',
        toolsAdded: ['endCall'],
      }),
      llm.AgentHandoffItem.create({
        id: 'ho',
        newAgentId: 'task-agent',
      }),
    ]);

    const stripped = stripRealtimeUnsupportedChatItems(chatCtx);
    expect(stripped.items.map((item) => item.type)).toEqual(['message']);
    expect(stripped.items[0].id).toBe('m1');
  });
});

describe('createRealtimeLlm wrappers', () => {
  it('xAI realtime uses the Speeko subclass', () => {
    const model = createRealtimeLlm(
      meta({ model: 'xai/grok-voice-think-fast-2.0' }),
      { XAI_API_KEY: 'xai-test' },
    );
    expect(model).toBeInstanceOf(SpeekoXaiRealtimeModel);
    const opts = (
      model as unknown as {
        _options: { turnDetection: typeof XAI_REALTIME_TURN_DETECTION };
      }
    )._options.turnDetection;
    expect(opts).toEqual(XAI_REALTIME_TURN_DETECTION);
    expect(opts.silence_duration_ms).toBe(700);
    expect(opts.interrupt_response).toBe(false);
  });

  it('OpenAI realtime uses the Speeko subclass', () => {
    const model = createRealtimeLlm(
      meta({ model: 'openai/gpt-realtime-2.1-mini' }),
      { OPENAI_API_KEY: 'sk-test' },
    );
    expect(model).toBeInstanceOf(SpeekoOpenaiRealtimeModel);
    const opts = (
      model as unknown as {
        _options: { turnDetection: { type: string; eagerness: string } };
      }
    )._options.turnDetection;
    expect(opts.type).toBe('semantic_vad');
    expect(opts.eagerness).toBe('medium');
  });
});
