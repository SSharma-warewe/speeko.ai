/**
 * Decide whether the worker actually finished the LiveKit task.
 * Do not treat synthetic hangup/crash outcomes as a completed workflow.
 */
const SYNTHETIC_OUTCOMES = new Set(['NO_ANSWER', 'AGENT_ERROR']);

export function workerReportedTaskCompleted(input: {
  taskCompleted?: boolean;
  taskResult?: Record<string, unknown> | null;
  toolEvents?: Array<Record<string, unknown>> | null;
}): boolean {
  if (input.taskCompleted === true) {
    return true;
  }
  if (hasSuccessfulCompleteTool(input.toolEvents)) {
    return true;
  }
  const outcome = input.taskResult?.outcome;
  if (
    typeof outcome === 'string' &&
    outcome.length > 0 &&
    !SYNTHETIC_OUTCOMES.has(outcome)
  ) {
    return true;
  }
  return false;
}

function hasSuccessfulCompleteTool(
  events?: Array<Record<string, unknown>> | null,
): boolean {
  if (!Array.isArray(events) || events.length === 0) {
    return false;
  }
  return events.some((event) => {
    const id = typeof event.toolId === 'string' ? event.toolId : '';
    return id.startsWith('complete_') && event.ok !== false;
  });
}
