import type { AgentJobMetadata } from '../job-metadata';
import {
  resolveLlmModelOptions,
  resolveTtsModelOptions,
  resolveTtsVoice,
} from '../builders/model-builder';
import { INFERENCE_MODELS } from '../models';

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
});
