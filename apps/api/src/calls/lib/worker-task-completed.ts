/**
 * Decide whether the worker actually finished the LiveKit task.
 * Do not treat synthetic hangup/crash outcomes as a completed workflow.
 */

export function workerReportedTaskCompleted(input: {
  taskCompleted?: boolean;
  taskResult?: Record<string, unknown> | null;
  toolEvents?: Array<Record<string, unknown>> | null;
}): boolean {
  if (typeof input.taskCompleted === 'boolean') return input.taskCompleted;
  return hasSuccessfulCompleteTool(input.toolEvents);
}

function hasSuccessfulCompleteTool(
  events?: Array<Record<string, unknown>> | null,
): boolean {
  if (!Array.isArray(events) || events.length === 0) {
    return false;
  }
  return events.some((event) => {
    const id = typeof event.toolId === 'string' ? event.toolId : '';
    return id.startsWith('complete_') && event.ok === true;
  });
}
