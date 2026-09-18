import {
  PIPELINE_ENDPOINTING,
  PIPELINE_INTERRUPTION,
  PIPELINE_PREEMPTIVE,
  resolveAecWarmupDuration,
} from '../builders/voice-builder';

describe('PIPELINE_INTERRUPTION', () => {
  it('keeps overlapping user audio during an uninterruptible opening', () => {
    expect(PIPELINE_INTERRUPTION.discardAudioIfUninterruptible).toBe(false);
  });
});

describe('PIPELINE_ENDPOINTING', () => {
  it('keeps the 300ms EOT floor and caps uncertain turns at 500ms', () => {
    expect(PIPELINE_ENDPOINTING.minDelay).toBe(300);
    expect(PIPELINE_ENDPOINTING.maxDelay).toBe(500);
  });
});

describe('PIPELINE_PREEMPTIVE', () => {
  it('starts TTS during the EOT wait', () => {
    expect(PIPELINE_PREEMPTIVE.preemptiveTts).toBe(true);
  });
});

describe('resolveAecWarmupDuration', () => {
  it('disables LiveKit AEC warmup on SIP and leaves web on the SDK default', () => {
    expect(resolveAecWarmupDuration('sip')).toBeNull();
    expect(resolveAecWarmupDuration('web')).toBeUndefined();
    expect(resolveAecWarmupDuration()).toBeUndefined();
  });
});
