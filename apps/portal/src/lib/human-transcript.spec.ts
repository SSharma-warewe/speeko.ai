import type { CallRecord } from '@call-agent/contracts';
import {
  humanTranscriptMessage,
  shouldRefreshHumanTranscript,
} from './human-transcript';

describe('human transcript display', () => {
  const call = (
    status: string,
    endedAt: string | null = new Date().toISOString(),
  ) =>
    ({
      executionType: 'human',
      endedAt,
      humanCall: { transcription: { status } },
      transcript: [{ content: 'नमस्ते, hello' }],
    }) as CallRecord;
  it('keeps active speech hidden behind an after-hangup message', () => {
    expect(humanTranscriptMessage(call('running', null))).toContain(
      'after hang-up',
    );
    expect(shouldRefreshHumanTranscript(call('unavailable', null))).toBe(true);
  });
  it.each(['complete', 'partial', 'unavailable', 'not_needed'])(
    'does not poll terminal status %s',
    (status) => {
      expect(shouldRefreshHumanTranscript(call(status))).toBe(false);
      expect(humanTranscriptMessage(call(status))).toBeTruthy();
    },
  );
  it('polls finalization briefly and stops after the deadline', () => {
    expect(shouldRefreshHumanTranscript(call('finalizing'))).toBe(true);
    expect(
      shouldRefreshHumanTranscript(
        call('finalizing', new Date(Date.now() - 41000).toISOString()),
      ),
    ).toBe(false);
  });
});
