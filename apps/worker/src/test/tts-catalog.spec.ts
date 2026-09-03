import {
  DEFAULT_TTS_MODEL_ID,
  KNOWN_TTS_MODEL_IDS,
  canonicalizeTtsModelId,
  isVoiceAllowed,
  ttsModelSpec,
} from '@call-agent/contracts';

describe('TTS catalog', () => {
  it('includes Inworld, Fish, OpenAI, and Grok TTS', () => {
    expect([...KNOWN_TTS_MODEL_IDS]).toEqual([
      'inworld/inworld-tts-2',
      'fishaudio/s2.1-pro-free',
      'openai/gpt-4o-mini-tts',
      'xai/tts-1',
    ]);
    expect(ttsModelSpec('openai/gpt-4o-mini-tts').backend).toBe(
      'openai-plugin',
    );
    expect(ttsModelSpec('xai/tts-1').backend).toBe('xai-plugin');
    expect(
      canonicalizeTtsModelId('google/gemini-3.1-flash-tts-preview'),
    ).toBeUndefined();
  });

  it('normalizes OpenRouter Fish slug to LiveKit id', () => {
    expect(canonicalizeTtsModelId('fish-audio/s2.1-pro-free:free')).toBe(
      'fishaudio/s2.1-pro-free',
    );
    expect(ttsModelSpec('fish-audio/s2.1-pro-free:free').backend).toBe(
      'livekit-inference',
    );
  });

  it('unknown slug and null fall back to Inworld', () => {
    expect(ttsModelSpec(null).id).toBe(DEFAULT_TTS_MODEL_ID);
    expect(ttsModelSpec('google/gemini-3.1-flash-tts-preview').id).toBe(
      DEFAULT_TTS_MODEL_ID,
    );
    expect(ttsModelSpec(null).backend).toBe('livekit-inference');
  });

  it('voice allowlists are per model', () => {
    expect(isVoiceAllowed(null, 'Ashley')).toBe(true);
    expect(
      isVoiceAllowed('fishaudio/s2.1-pro-free', 'Ashley'),
    ).toBe(false);
    expect(isVoiceAllowed('fishaudio/s2.1-pro-free', null)).toBe(true);
  });
});
