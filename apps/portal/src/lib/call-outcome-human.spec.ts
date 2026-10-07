import { callDisplayOutcome } from './call-outcome';

describe('human call outcomes', () => {
  it('an ended human session never displays an AI workflow result', () => {
    expect(callDisplayOutcome({ executionType: 'human', status: 'completed', taskResult: { outcome: 'BOOKED' } })).toEqual({ label: 'Call ended', tone: 'neutral' });
  });
  it('preserves busy/no-answer classifications for human calls', () => {
    expect(callDisplayOutcome({ executionType: 'human', status: 'failed', lastFailureCode: 'busy' }).label).toBe('Busy');
    expect(callDisplayOutcome({ executionType: 'human', status: 'failed', lastFailureCode: 'no_answer' }).label).toBe('No answer');
  });
});
