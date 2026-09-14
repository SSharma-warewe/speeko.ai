import {
  PIPELINE_INTERRUPTION,
  resolveAecWarmupDuration,
} from '../builders/voice-builder';

describe('PIPELINE_INTERRUPTION', () => {
  it('keeps overlapping user audio during an uninterruptible opening', () => {
    expect(PIPELINE_INTERRUPTION.discardAudioIfUninterruptible).toBe(false);
  });
});

describe('resolveAecWarmupDuration', () => {
  it('disables LiveKit AEC warmup on SIP and leaves web on the SDK default', () => {
    expect(resolveAecWarmupDuration('sip')).toBeNull();
    expect(resolveAecWarmupDuration('web')).toBeUndefined();
    expect(resolveAecWarmupDuration()).toBeUndefined();
  });
});
