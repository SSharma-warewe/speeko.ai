import {
  DEFAULT_STT_MODEL_ID,
  KNOWN_STT_MODEL_IDS,
  canonicalizeSttModelId,
  isSarvamRealtimeSttModel,
  sttModelSpec,
} from '@call-agent/contracts';

describe('STT catalog', () => {
  it('includes Deepgram and both Sarvam paths', () => {
    expect([...KNOWN_STT_MODEL_IDS]).toEqual([
      'deepgram/nova-3',
      'sarvam/saaras-v3',
      'sarvam/saaras-v3-realtime',
    ]);
    expect(sttModelSpec(null).id).toBe(DEFAULT_STT_MODEL_ID);
    expect(sttModelSpec(null).backend).toBe('livekit-inference');
    expect(sttModelSpec('saaras:v3').backend).toBe('sarvam-plugin');
    expect(sttModelSpec('saaras:v3-realtime').realtime).toBe(true);
    expect(isSarvamRealtimeSttModel('sarvam/saaras-realtime')).toBe(true);
    expect(isSarvamRealtimeSttModel('sarvam/saaras-v3')).toBe(false);
    expect(canonicalizeSttModelId('whisper-1')).toBeUndefined();
  });
});
