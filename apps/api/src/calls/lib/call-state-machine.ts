import { BadRequestException } from '@nestjs/common';
import { Call, CallStatus, CallTaskStatus } from '../call.entity';

/**
 * Call lifecycle events. Services apply an event; they do not assign
 * `call.status` ad hoc. SQL claim/release uses the same from→to pairs.
 */
export enum CallLifecycleEvent {
  ENQUEUE = 'enqueue',
  START_IMMEDIATE = 'start_immediate',
  CLAIM = 'claim',
  RELEASE_CLAIM = 'release_claim',
  DISPATCH = 'dispatch',
  ANSWERED = 'answered',
  TASK_COMPLETE = 'task_complete',
  SESSION_ENDED_NO_TASK = 'session_ended_no_task',
  DIAL_FAILED = 'dial_failed',
  REQUEUE = 'requeue',
  STALE_TIMEOUT = 'stale_timeout',
  CANCEL = 'cancel',
  RETRY_NOW = 'retry_now',
  LATE_COMPLETE = 'late_complete',
}

/** New row (not yet persisted / no prior status). */
export const CALL_STATUS_NEW = null;

export type CallStatusFrom = CallStatus | typeof CALL_STATUS_NEW;

export type CallTransition = {
  from: CallStatusFrom;
  event: CallLifecycleEvent;
  to: CallStatus;
};

/**
 * Allowed (from, event, to) triples. Source of truth for TypeORM writes
 * and documentation for SQL claim/release.
 */
export const CALL_TRANSITION_TABLE: readonly CallTransition[] = [
  { from: null, event: CallLifecycleEvent.ENQUEUE, to: CallStatus.PENDING },
  {
    from: null,
    event: CallLifecycleEvent.START_IMMEDIATE,
    to: CallStatus.CREATING,
  },

  { from: CallStatus.PENDING, event: CallLifecycleEvent.CLAIM, to: CallStatus.CREATING },
  { from: CallStatus.PENDING, event: CallLifecycleEvent.CANCEL, to: CallStatus.CANCELLED },
  { from: CallStatus.PENDING, event: CallLifecycleEvent.RETRY_NOW, to: CallStatus.PENDING },

  {
    from: CallStatus.CREATING,
    event: CallLifecycleEvent.RELEASE_CLAIM,
    to: CallStatus.PENDING,
  },
  {
    from: CallStatus.CREATING,
    event: CallLifecycleEvent.REQUEUE,
    to: CallStatus.PENDING,
  },
  {
    from: CallStatus.CREATING,
    event: CallLifecycleEvent.DISPATCH,
    to: CallStatus.DIALING,
  },
  {
    from: CallStatus.CREATING,
    event: CallLifecycleEvent.DISPATCH,
    to: CallStatus.READY,
  },
  {
    from: CallStatus.CREATING,
    event: CallLifecycleEvent.DIAL_FAILED,
    to: CallStatus.FAILED,
  },
  {
    from: CallStatus.CREATING,
    event: CallLifecycleEvent.STALE_TIMEOUT,
    to: CallStatus.FAILED,
  },
  {
    from: CallStatus.CREATING,
    event: CallLifecycleEvent.STALE_TIMEOUT,
    to: CallStatus.PENDING,
  },

  {
    from: CallStatus.DIALING,
    event: CallLifecycleEvent.ANSWERED,
    to: CallStatus.READY,
  },
  {
    from: CallStatus.DIALING,
    event: CallLifecycleEvent.TASK_COMPLETE,
    to: CallStatus.COMPLETED,
  },
  {
    from: CallStatus.DIALING,
    event: CallLifecycleEvent.SESSION_ENDED_NO_TASK,
    to: CallStatus.INCOMPLETE,
  },
  {
    from: CallStatus.DIALING,
    event: CallLifecycleEvent.DIAL_FAILED,
    to: CallStatus.FAILED,
  },
  {
    from: CallStatus.DIALING,
    event: CallLifecycleEvent.REQUEUE,
    to: CallStatus.PENDING,
  },
  {
    from: CallStatus.DIALING,
    event: CallLifecycleEvent.STALE_TIMEOUT,
    to: CallStatus.FAILED,
  },
  {
    from: CallStatus.DIALING,
    event: CallLifecycleEvent.STALE_TIMEOUT,
    to: CallStatus.PENDING,
  },

  {
    from: CallStatus.READY,
    event: CallLifecycleEvent.TASK_COMPLETE,
    to: CallStatus.COMPLETED,
  },
  {
    from: CallStatus.READY,
    event: CallLifecycleEvent.SESSION_ENDED_NO_TASK,
    to: CallStatus.INCOMPLETE,
  },
  {
    from: CallStatus.READY,
    event: CallLifecycleEvent.DIAL_FAILED,
    to: CallStatus.FAILED,
  },
  {
    from: CallStatus.READY,
    event: CallLifecycleEvent.REQUEUE,
    to: CallStatus.PENDING,
  },
  {
    from: CallStatus.READY,
    event: CallLifecycleEvent.STALE_TIMEOUT,
    to: CallStatus.FAILED,
  },
  {
    from: CallStatus.READY,
    event: CallLifecycleEvent.STALE_TIMEOUT,
    to: CallStatus.PENDING,
  },

  {
    from: CallStatus.FAILED,
    event: CallLifecycleEvent.RETRY_NOW,
    to: CallStatus.PENDING,
  },

  {
    from: CallStatus.COMPLETED,
    event: CallLifecycleEvent.LATE_COMPLETE,
    to: CallStatus.COMPLETED,
  },
  {
    from: CallStatus.INCOMPLETE,
    event: CallLifecycleEvent.LATE_COMPLETE,
    to: CallStatus.INCOMPLETE,
  },
  {
    from: CallStatus.FAILED,
    event: CallLifecycleEvent.LATE_COMPLETE,
    to: CallStatus.FAILED,
  },
  {
    from: CallStatus.CANCELLED,
    event: CallLifecycleEvent.LATE_COMPLETE,
    to: CallStatus.CANCELLED,
  },
];

export const TERMINAL_CALL_STATUSES: readonly CallStatus[] = [
  CallStatus.COMPLETED,
  CallStatus.INCOMPLETE,
  CallStatus.FAILED,
  CallStatus.CANCELLED,
];

export function isTerminalCallStatus(status: CallStatus): boolean {
  return (TERMINAL_CALL_STATUSES as readonly string[]).includes(status);
}

export function isAllowedCallTransition(
  from: CallStatusFrom,
  event: CallLifecycleEvent,
  to: CallStatus,
): boolean {
  return CALL_TRANSITION_TABLE.some(
    (row) => row.from === from && row.event === event && row.to === to,
  );
}

export class IllegalCallTransitionError extends BadRequestException {
  constructor(
    from: CallStatusFrom,
    event: CallLifecycleEvent,
    to: CallStatus,
  ) {
    super(
      `Illegal call transition ${from ?? 'new'} --${event}--> ${to}`,
    );
  }
}

export type ApplyCallEventOptions = {
  /**
   * `strict` (default) throws on illegal transitions (user actions).
   * `lenient` logs and leaves the row unchanged (late/racy worker callbacks).
   */
  mode?: 'strict' | 'lenient';
  logger?: { warn: (message: string) => void };
};

type CallStatusHolder = Pick<Call, 'status' | 'taskStatus'>;

function taskStatusForEvent(
  event: CallLifecycleEvent,
): CallTaskStatus | undefined {
  if (event === CallLifecycleEvent.TASK_COMPLETE) {
    return CallTaskStatus.COMPLETED;
  }
  if (event === CallLifecycleEvent.SESSION_ENDED_NO_TASK) {
    return CallTaskStatus.INCOMPLETE;
  }
  return undefined;
}

/**
 * Apply a lifecycle event to a call row. Returns true when status changed
 * (or late-complete no-op succeeded). Returns false when lenient-ignored.
 */
export function applyCallEvent(
  call: CallStatusHolder,
  event: CallLifecycleEvent,
  to: CallStatus,
  options: ApplyCallEventOptions = {},
): boolean {
  const from = call.status ?? null;
  if (!isAllowedCallTransition(from, event, to)) {
    const message = `Illegal call transition ${from ?? 'new'} --${event}--> ${to}`;
    if (options.mode === 'lenient') {
      options.logger?.warn(message);
      return false;
    }
    throw new IllegalCallTransitionError(from, event, to);
  }

  call.status = to;
  const nextTask = taskStatusForEvent(event);
  if (nextTask) {
    call.taskStatus = nextTask;
  }
  return true;
}

/** Set status on a brand-new call row (enqueue or immediate dial/test). */
export function initializeCallStatus(
  call: CallStatusHolder,
  event:
    | CallLifecycleEvent.ENQUEUE
    | CallLifecycleEvent.START_IMMEDIATE,
): void {
  const to =
    event === CallLifecycleEvent.ENQUEUE
      ? CallStatus.PENDING
      : CallStatus.CREATING;
  if (!isAllowedCallTransition(null, event, to)) {
    throw new IllegalCallTransitionError(null, event, to);
  }
  call.status = to;
  call.taskStatus = CallTaskStatus.PENDING;
}
