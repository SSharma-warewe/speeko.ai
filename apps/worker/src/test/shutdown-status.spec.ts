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
      taskCompleted: false,
      taskResult: { task: 'general', outcome: 'NO_ANSWER' },
    });
  });

  it('answered SIP without task.complete → session completed, taskCompleted false', () => {
    expect(
      classifyShutdownComplete({
        requireAnswer: true,
        answeredAt: '2026-08-17T07:13:00.000Z',
        taskKey: 'general',
        taskResult: null,
        taskCompleted: false,
      }),
    ).toEqual({ status: 'completed', taskCompleted: false });
  });

  it('answered SIP with task.complete → session completed, taskCompleted true', () => {
    expect(
      classifyShutdownComplete({
        requireAnswer: true,
        answeredAt: '2026-08-17T07:13:00.000Z',
        taskKey: 'general',
        taskResult: { task: 'general', outcome: 'COMPLETED' },
        taskCompleted: true,
      }),
    ).toEqual({ status: 'completed', taskCompleted: true });
  });

  it('web / no-answer-required without task.complete → completed, taskCompleted false', () => {
    expect(
      classifyShutdownComplete({
        requireAnswer: false,
        answeredAt: null,
        taskKey: 'general',
      }),
    ).toEqual({ status: 'completed', taskCompleted: false });
  });
});
