import {
  PIPELINE_INTERRUPTION,
  SARVAM_REALTIME_TURN_HANDLING,
  resolveAecWarmupDuration,
} from '../builders/voice-builder';

describe('PIPELINE_INTERRUPTION', () => {
  it('keeps overlapping user audio during an uninterruptible opening', () => {
    expect(PIPELINE_INTERRUPTION.discardAudioIfUninterruptible).toBe(false);
  });
});

describe('SARVAM_REALTIME_TURN_HANDLING', () => {
  it('trusts Sarvam STT VAD with a short preemptive hold', () => {
    expect(SARVAM_REALTIME_TURN_HANDLING.turnDetection).toBe('stt');
    expect(SARVAM_REALTIME_TURN_HANDLING.endpointing.minDelay).toBe(250);
    expect(SARVAM_REALTIME_TURN_HANDLING.endpointing.maxDelay).toBe(400);
    expect(SARVAM_REALTIME_TURN_HANDLING.preemptiveGeneration.enabled).toBe(
      true,
    );
    expect(SARVAM_REALTIME_TURN_HANDLING.interruption.mode).toBe('vad');
    expect(SARVAM_REALTIME_TURN_HANDLING.interruption.minWords).toBe(1);
    expect(
      SARVAM_REALTIME_TURN_HANDLING.interruption.discardAudioIfUninterruptible,
    ).toBe(false);
  });
});

describe('resolveAecWarmupDuration', () => {
  it('disables LiveKit AEC warmup on SIP and leaves web on the SDK default', () => {
    expect(resolveAecWarmupDuration('sip')).toBeNull();
    expect(resolveAecWarmupDuration('web')).toBeUndefined();
    expect(resolveAecWarmupDuration()).toBeUndefined();
  });
});
