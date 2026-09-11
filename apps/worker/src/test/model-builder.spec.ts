import type { AgentJobMetadata } from '../job-metadata';
import {
  XAI_REALTIME_TURN_DETECTION,
  createLlm,
  createRealtimeLlm,
  createStt,
  createTts,
  resolveLlmModelOptions,
  resolveRealtimeVoice,
  resolveSttLanguage,
  resolveSttSpec,
  resolveTtsLanguage,
  resolveTtsModelOptions,
  resolveTtsSpec,
  resolveTtsVoice,
} from '../builders/model-builder';
import { SarvamRealtimeSTT } from '../sarvam/realtime-stt';
import { INFERENCE_MODELS } from '../models';
import * as openai from '@livekit/agents-plugin-openai';
import * as sarvam from '@livekit/agents-plugin-sarvam';
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

  it('OpenAI / xAI / Sarvam plugin models require worker keys', () => {
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
      createTts(meta({ ttsModel: 'sarvam/bulbul-v3' }), {}),
    ).toThrow(/SARVAM_API_KEY/);
    expect(() =>
      createStt(meta({ sttModel: 'sarvam/saaras-v3' }), {}),
    ).toThrow(/SARVAM_API_KEY/);
    expect(() =>
      createStt(meta({ sttModel: 'sarvam/saaras-v3-realtime' }), {}),
    ).toThrow(/SARVAM_API_KEY/);
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

    const sarvamTts = createTts(
      meta({ ttsModel: 'sarvam/bulbul-v3', voice: 'shubh' }),
      { SARVAM_API_KEY: 'sk_test' },
    );
    expect(sarvamTts).toBeInstanceOf(sarvam.TTS);

    const sarvamStt = createStt(
      meta({ sttModel: 'sarvam/saaras-v3' }),
      { SARVAM_API_KEY: 'sk_test' },
    );
    expect(sarvamStt).toBeInstanceOf(sarvam.STT);

    const sarvamRealtimeStt = createStt(
      meta({ sttModel: 'sarvam/saaras-v3-realtime' }),
      { SARVAM_API_KEY: 'sk_test' },
    );
    expect(sarvamRealtimeStt).toBeInstanceOf(SarvamRealtimeSTT);
  });

  it('Sarvam realtime STT is flagged so the session can skip cloud EOT', () => {
    expect(
      resolveSttSpec(meta({ sttModel: 'sarvam/saaras-v3-realtime' })).realtime,
    ).toBe(true);
    expect(resolveSttSpec(meta({ sttModel: 'sarvam/saaras-v3' })).realtime).toBe(
      undefined,
    );
  });

  it('Sarvam maps speakingRate to pace', () => {
    expect(
      resolveTtsModelOptions(
        meta({
          ttsModel: 'sarvam/bulbul-v3',
          speakingRate: 1.2,
          deliveryMode: 'CREATIVE',
        }),
      ),
    ).toEqual({ pace: 1.2 });
  });

  it('Sarvam TTS language falls back from persona; STT defaults to unknown', () => {
    expect(resolveSttLanguage(meta())).toBe('unknown');
    expect(resolveTtsLanguage(meta())).toBe('en-IN');
    expect(
      resolveTtsLanguage(
        meta({
          prompt: { systemPrompt: 'You speak Hindi Devanagari.' },
        }),
      ),
    ).toBe('hi-IN');
    expect(
      resolveTtsLanguage(
        meta({
          speechLanguage: 'unknown',
          prompt: { systemPrompt: 'You speak Hindi.' },
        }),
      ),
    ).toBe('hi-IN');
    expect(resolveTtsLanguage(meta({ speechLanguage: 'ta-IN' }))).toBe(
      'ta-IN',
    );
    expect(resolveSttLanguage(meta({ speechLanguage: 'hi-IN' }))).toBe(
      'hi-IN',
    );
  });

  it('Grok realtime pins slower server VAD and does not interrupt', () => {
    expect(XAI_REALTIME_TURN_DETECTION).toEqual({
      type: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 400,
      silence_duration_ms: 700,
      create_response: true,
      interrupt_response: false,
    });
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
