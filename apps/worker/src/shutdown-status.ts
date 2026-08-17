/**
 * Decide what the worker should POST on job shutdown.
 * Unanswered SIP legs are failed/no_answer (retryable) — never completed.
 */

export type ShutdownCompleteDecision = {
  status: 'completed' | 'failed';
  failureCode?: 'no_answer';
  errorMessage?: string;
  taskResult?: Record<string, unknown> | null;
};

export function classifyShutdownComplete(input: {
  /** True for SIP legs that must wait for the callee to answer. */
  requireAnswer: boolean;
  answeredAt: string | null;
  taskKey?: string;
  taskResult?: Record<string, unknown> | null;
}): ShutdownCompleteDecision {
  if (input.requireAnswer && !input.answeredAt) {
    return {
      status: 'failed',
      failureCode: 'no_answer',
      errorMessage: 'Callee never answered (SIP participant left before active)',
      taskResult: {
        ...(input.taskResult ?? {}),
        task: input.taskKey,
        outcome: 'NO_ANSWER',
      },
    };
  }
  return { status: 'completed' };
}
