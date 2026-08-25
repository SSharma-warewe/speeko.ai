export const QueueBackoffStrategy = {
  FIXED: 'fixed',
  EXPONENTIAL: 'exponential',
} as const;
export type QueueBackoffStrategy =
  (typeof QueueBackoffStrategy)[keyof typeof QueueBackoffStrategy];

export const CallBatchStatus = {
  RUNNING: 'running',
  PAUSED: 'paused',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
} as const;
export type CallBatchStatus =
  (typeof CallBatchStatus)[keyof typeof CallBatchStatus];
