import {
  DEFAULT_STT_MODEL_ID,
  KNOWN_STT_MODEL_IDS,
  canonicalizeSttModelId,
  sttModelSpec,
} from '@call-agent/contracts';

describe('STT catalog', () => {
  it('includes Deepgram and Sarvam', () => {
    expect([...KNOWN_STT_MODEL_IDS]).toEqual([
      'deepgram/nova-3',
      'sarvam/saaras-v3',
    ]);
    expect(sttModelSpec(null).id).toBe(DEFAULT_STT_MODEL_ID);
    expect(sttModelSpec(null).backend).toBe('livekit-inference');
    expect(sttModelSpec('saaras:v3').backend).toBe('sarvam-plugin');
    expect(canonicalizeSttModelId('whisper-1')).toBeUndefined();
  });
});
