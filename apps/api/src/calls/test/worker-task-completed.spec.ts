import { workerReportedTaskCompleted } from '../lib/worker-task-completed';

describe('workerReportedTaskCompleted', () => {
  it('true when the worker flag is set', () => {
    expect(workerReportedTaskCompleted({ taskCompleted: true })).toBe(true);
  });

  it('true when a complete_* tool succeeded', () => {
    expect(
      workerReportedTaskCompleted({
        taskCompleted: false,
        toolEvents: [
          { toolId: 'checkGhlFreeSlots', ok: true },
          { toolId: 'complete_demo_booking_task', ok: true },
        ],
      }),
    ).toBe(true);
  });

  it('true when taskResult has a real workflow outcome', () => {
    expect(
      workerReportedTaskCompleted({
        taskResult: { task: 'demo_booking', outcome: 'BOOKED_AND_QUALIFIED' },
      }),
    ).toBe(true);
  });

  it('false for synthetic NO_ANSWER leftover', () => {
    expect(
      workerReportedTaskCompleted({
        taskCompleted: false,
        taskResult: { outcome: 'NO_ANSWER' },
      }),
    ).toBe(false);
  });

  it('false when nothing indicates the task finished', () => {
    expect(
      workerReportedTaskCompleted({
        taskCompleted: false,
        toolEvents: [{ toolId: 'endCall', ok: true }],
      }),
    ).toBe(false);
  });
});
