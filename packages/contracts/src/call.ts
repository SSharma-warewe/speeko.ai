/**
 * Call lifecycle. Buckets for listing:
 * - pending: PENDING
 * - in_progress: CREATING | DIALING | READY
 * - done: COMPLETED | INCOMPLETE | FAILED | CANCELLED
 *
 * `completed` = session ended AND the LiveKit task called complete_*.
 * `incomplete` = live conversation ended without task.complete().
 * `failed` = never had a successful conversation (no answer / SIP / timeout).
 */
export const CallStatus = {
  PENDING: 'pending',
  CREATING: 'creating',
  DIALING: 'dialing',
  READY: 'ready',
  FAILED: 'failed',
  COMPLETED: 'completed',
  INCOMPLETE: 'incomplete',
  CANCELLED: 'cancelled',
} as const;
export type CallStatus = (typeof CallStatus)[keyof typeof CallStatus];

/** Workflow flag — do not infer from task_result JSON. */
export const CallTaskStatus = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  INCOMPLETE: 'incomplete',
} as const;
export type CallTaskStatus = (typeof CallTaskStatus)[keyof typeof CallTaskStatus];

export const CallBucket = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
} as const;
export type CallBucket = (typeof CallBucket)[keyof typeof CallBucket];

export const CallMedium = {
  WEB: 'web',
  SIP: 'sip',
} as const;
export type CallMedium = (typeof CallMedium)[keyof typeof CallMedium];

/** Dial / session failure classification for queue retry policy. */
export const CallFailureCode = {
  NO_ANSWER: 'no_answer',
  BUSY: 'busy',
  SIP_ERROR: 'sip_error',
  TIMEOUT: 'timeout',
  AGENT_ERROR: 'agent_error',
  CANCELLED: 'cancelled',
  UNKNOWN: 'unknown',
} as const;
export type CallFailureCode =
  (typeof CallFailureCode)[keyof typeof CallFailureCode];

export const CALL_BUCKET_STATUSES: Record<CallBucket, CallStatus[]> = {
  [CallBucket.PENDING]: [CallStatus.PENDING],
  [CallBucket.IN_PROGRESS]: [
    CallStatus.CREATING,
    CallStatus.DIALING,
    CallStatus.READY,
  ],
  [CallBucket.DONE]: [
    CallStatus.COMPLETED,
    CallStatus.INCOMPLETE,
    CallStatus.FAILED,
    CallStatus.CANCELLED,
  ],
};

export const DEFAULT_RETRY_ON: CallFailureCode[] = [
  CallFailureCode.NO_ANSWER,
  CallFailureCode.BUSY,
  CallFailureCode.TIMEOUT,
  CallFailureCode.SIP_ERROR,
];

export type CallTranscriptItem = {
  role: string;
  content: string;
  createdAt?: string | number | null;
  id?: string;
};
