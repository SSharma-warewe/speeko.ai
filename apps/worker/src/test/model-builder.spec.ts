import type { AgentJobMetadata } from '../job-metadata';
import {
  createTts,
  resolveLlmModelOptions,
  resolveTtsModelOptions,
  resolveTtsSpec,
  resolveTtsVoice,
} from '../builders/model-builder';
import { INFERENCE_MODELS } from '../models';
import { OpenRouterTts } from '../tts/openrouter-tts';

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

  it('Gemini uses OpenRouter and requires OPENROUTER_API_KEY', () => {
    expect(() =>
      createTts(meta({ ttsModel: 'google/gemini-3.1-flash-tts-preview' }), {}),
    ).toThrow(/OPENROUTER_API_KEY/);

    const tts = createTts(
      meta({
        ttsModel: 'google/gemini-3.1-flash-tts-preview',
        voice: 'Kore',
      }),
      { OPENROUTER_API_KEY: 'sk-or-test' },
    );
    expect(tts).toBeInstanceOf(OpenRouterTts);
    expect((tts as OpenRouterTts).opts.model).toBe(
      'google/gemini-3.1-flash-tts-preview',
    );
    expect((tts as OpenRouterTts).opts.voice).toBe('Kore');
  });
});
