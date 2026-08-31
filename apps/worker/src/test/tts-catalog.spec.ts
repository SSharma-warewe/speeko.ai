import {
  DEFAULT_TTS_MODEL_ID,
  canonicalizeTtsModelId,
  isVoiceAllowed,
  ttsModelSpec,
} from '@call-agent/contracts';

describe('TTS catalog', () => {
  it('normalizes OpenRouter Fish slug to LiveKit id', () => {
    expect(canonicalizeTtsModelId('fish-audio/s2.1-pro-free:free')).toBe(
      'fishaudio/s2.1-pro-free',
    );
    expect(ttsModelSpec('fish-audio/s2.1-pro-free:free').backend).toBe(
      'livekit-inference',
    );
  });

  it('Gemini is OpenRouter; Inworld is default', () => {
    expect(ttsModelSpec(null).id).toBe(DEFAULT_TTS_MODEL_ID);
    expect(ttsModelSpec('google/gemini-3.1-flash-tts-preview').backend).toBe(
      'openrouter',
    );
  });

  it('voice allowlists are per model', () => {
    expect(isVoiceAllowed(null, 'Ashley')).toBe(true);
    expect(isVoiceAllowed('google/gemini-3.1-flash-tts-preview', 'Kore')).toBe(
      true,
    );
    expect(
      isVoiceAllowed('google/gemini-3.1-flash-tts-preview', 'Ashley'),
    ).toBe(false);
    expect(isVoiceAllowed('fishaudio/s2.1-pro-free', null)).toBe(true);
  });
});
