import { workerReportedTaskCompleted } from '../lib/worker-task-completed';

describe('workerReportedTaskCompleted', () => {
  it('supports successful legacy completion tools only when the flag is omitted', () => {
    expect(workerReportedTaskCompleted({ toolEvents: [{ toolId: 'complete_general_task', ok: true }] })).toBe(true);
    expect(workerReportedTaskCompleted({ toolEvents: [{ toolId: 'complete_general_task', ok: false }] })).toBe(false);
  });
  it('true when the worker flag is set', () => {
    expect(workerReportedTaskCompleted({ taskCompleted: true })).toBe(true);
  });

  it('explicit false is authoritative even when a complete tool succeeded', () => {
    expect(
      workerReportedTaskCompleted({
        taskCompleted: false,
        toolEvents: [
          { toolId: 'checkGhlFreeSlots', ok: true },
          { toolId: 'complete_demo_booking_task', ok: true },
        ],
      }),
    ).toBe(false);
  });

  it('leftover result does not prove completion', () => {
    expect(
      workerReportedTaskCompleted({
        taskResult: { task: 'demo_booking', outcome: 'BOOKED_AND_QUALIFIED' },
      }),
    ).toBe(false);
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
