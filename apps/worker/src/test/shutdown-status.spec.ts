import { classifyShutdownComplete } from '../shutdown-status';

describe('classifyShutdownComplete', () => {
  it('unanswered SIP → failed no_answer', () => {
    expect(
      classifyShutdownComplete({
        requireAnswer: true,
        answeredAt: null,
        taskKey: 'general',
      }),
    ).toEqual({
      status: 'failed',
      failureCode: 'no_answer',
      errorMessage:
        'Callee never answered (SIP participant left before active)',
      taskResult: { task: 'general', outcome: 'NO_ANSWER' },
    });
  });

  it('answered SIP → completed even without task result', () => {
    expect(
      classifyShutdownComplete({
        requireAnswer: true,
        answeredAt: '2026-08-17T07:13:00.000Z',
        taskKey: 'general',
        taskResult: null,
      }),
    ).toEqual({ status: 'completed' });
  });

  it('web / no-answer-required → completed without answeredAt', () => {
    expect(
      classifyShutdownComplete({
        requireAnswer: false,
        answeredAt: null,
        taskKey: 'general',
      }),
    ).toEqual({ status: 'completed' });
  });
});
