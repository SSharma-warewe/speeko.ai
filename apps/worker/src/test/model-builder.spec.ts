import type { AgentJobMetadata } from '../job-metadata';
import {
  createLlm,
  createRealtimeLlm,
  createTts,
  resolveLlmModelOptions,
  resolveRealtimeVoice,
  resolveTtsModelOptions,
  resolveTtsSpec,
  resolveTtsVoice,
} from '../builders/model-builder';
import { INFERENCE_MODELS } from '../models';
import * as openai from '@livekit/agents-plugin-openai';
import * as xai from '@livekit/agents-plugin-xai';

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

describe('model-builder voice / temp helpers', () => {
  it('LLM temperature only when a number', () => {
    expect(resolveLlmModelOptions(meta())).toEqual({});
    expect(resolveLlmModelOptions(meta({ temperature: 0.7 }))).toEqual({
      temperature: 0.7,
    });
    expect(resolveLlmModelOptions(meta({ temperature: Number.NaN }))).toEqual(
      {},
    );
  });

  it('TTS voice falls back to worker pin', () => {
    expect(resolveTtsVoice(meta())).toBe(INFERENCE_MODELS.tts.voice);
    expect(resolveTtsVoice(meta({ voice: '  Olivia  ' }))).toBe('Olivia');
    expect(resolveTtsVoice(meta({ voice: '' }))).toBe(
      INFERENCE_MODELS.tts.voice,
    );
  });

  it('TTS modelOptions only include set speaking_rate / delivery_mode', () => {
    expect(resolveTtsModelOptions(meta())).toEqual({});
    expect(
      resolveTtsModelOptions(
        meta({ speakingRate: 0.8, deliveryMode: 'STABLE' }),
      ),
    ).toEqual({
      speaking_rate: 0.8,
      delivery_mode: 'STABLE',
    });
    expect(
      resolveTtsModelOptions(meta({ speakingRate: 1.0, deliveryMode: null })),
    ).toEqual({ speaking_rate: 1.0 });
  });

  it('Fish maps speakingRate to speed and ignores deliveryMode', () => {
    const spec = resolveTtsSpec(
      meta({ ttsModel: 'fishaudio/s2.1-pro-free' }),
    );
    expect(spec.backend).toBe('livekit-inference');
    expect(
      resolveTtsModelOptions(
        meta({
          ttsModel: 'fishaudio/s2.1-pro-free',
          speakingRate: 1.2,
          deliveryMode: 'CREATIVE',
        }),
        spec,
      ),
    ).toEqual({ speed: 1.2 });
    expect(
      resolveTtsVoice(
        meta({
          ttsModel: 'fishaudio/s2.1-pro-free',
          voice: 'Ashley',
        }),
        spec,
      ),
    ).toBe(spec.defaultVoice);
  });

  it('OpenAI / xAI plugin models require worker keys', () => {
    expect(() =>
      createLlm(meta({ model: 'openai/gpt-4.1-mini' }), {}),
    ).toThrow(/OPENAI_API_KEY/);
    expect(() =>
      createTts(meta({ ttsModel: 'openai/gpt-4o-mini-tts' }), {}),
    ).toThrow(/OPENAI_API_KEY/);
    expect(() => createTts(meta({ ttsModel: 'xai/tts-1' }), {})).toThrow(
      /XAI_API_KEY/,
    );
    expect(() =>
      createRealtimeLlm(
        meta({ model: 'xai/grok-voice-think-fast-2.0' }),
        {},
      ),
    ).toThrow(/XAI_API_KEY/);
  });

  it('builds plugin TTS when keys are present', () => {
    const tts = createTts(
      meta({ ttsModel: 'openai/gpt-4o-mini-tts', voice: 'ash' }),
      { OPENAI_API_KEY: 'sk-test' },
    );
    expect(tts).toBeInstanceOf(openai.TTS);

    const grokTts = createTts(
      meta({ ttsModel: 'xai/tts-1', voice: 'ara' }),
      { XAI_API_KEY: 'xai-test' },
    );
    expect(grokTts).toBeInstanceOf(xai.TTS);
  });

  it('realtime voice uses the realtime catalog', () => {
    expect(
      resolveRealtimeVoice(
        meta({ model: 'openai/gpt-realtime-2.1-mini', voice: 'cedar' }),
      ),
    ).toBe('cedar');
    expect(
      resolveRealtimeVoice(meta({ model: 'openai/gpt-realtime-2.1-mini' })),
    ).toBe('marin');
  });
});
