import {
  DEFAULT_LLM_MODEL_ID,
  canonicalizeLlmModelId,
  isRealtimeLlmModel,
  llmModelSpec,
} from '@call-agent/contracts';

describe('LLM catalog', () => {
  it('defaults to Gemma; aliases normalize', () => {
    expect(llmModelSpec(null).id).toBe(DEFAULT_LLM_MODEL_ID);
    expect(canonicalizeLlmModelId('gpt-4.1-mini')).toBe('openai/gpt-4.1-mini');
    expect(canonicalizeLlmModelId('grok-4.6')).toBe('xai/grok-4.6');
    expect(canonicalizeLlmModelId('grok-voice-latest')).toBe(
      'xai/grok-voice-think-fast-2.0',
    );
  });

  it('marks speech-to-speech ids as realtime', () => {
    expect(isRealtimeLlmModel(null)).toBe(false);
    expect(isRealtimeLlmModel('openai/gpt-4.1-mini')).toBe(false);
    expect(isRealtimeLlmModel('openai/gpt-realtime-2.1-mini')).toBe(true);
    expect(isRealtimeLlmModel('xai/grok-voice-think-fast-2.0')).toBe(true);
    expect(llmModelSpec('openai/gpt-realtime-2.1-mini').backend).toBe(
      'openai-plugin',
    );
    expect(llmModelSpec('xai/grok-4.6').backend).toBe('xai-plugin');
  });
});
