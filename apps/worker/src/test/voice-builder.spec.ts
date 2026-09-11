import {
  PIPELINE_INTERRUPTION,
  SARVAM_REALTIME_TURN_HANDLING,
} from '../builders/voice-builder';

describe('PIPELINE_INTERRUPTION', () => {
  it('keeps overlapping user audio during an uninterruptible opening', () => {
    expect(PIPELINE_INTERRUPTION.discardAudioIfUninterruptible).toBe(false);
  });
});

describe('SARVAM_REALTIME_TURN_HANDLING', () => {
  it('trusts Sarvam STT VAD with millisecond endpointing', () => {
    expect(SARVAM_REALTIME_TURN_HANDLING.turnDetection).toBe('stt');
    expect(SARVAM_REALTIME_TURN_HANDLING.endpointing.minDelay).toBe(300);
    expect(SARVAM_REALTIME_TURN_HANDLING.interruption.mode).toBe('vad');
    expect(SARVAM_REALTIME_TURN_HANDLING.interruption.minWords).toBe(1);
    expect(
      SARVAM_REALTIME_TURN_HANDLING.interruption.discardAudioIfUninterruptible,
    ).toBe(false);
  });
});
