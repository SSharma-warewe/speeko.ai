import { CallFailureCode, DEFAULT_RETRY_ON } from '../calls/call.entity';
import { QueueBackoffStrategy } from './organization-queue-settings.entity';

export const QUEUE_DEFAULTS = {
  /** Must match SIP trunk concurrent channel limit (often 1 on demo trunks). */
  maxConcurrent: 1,
  maxDialsPerMinute: 30,
  defaultMaxAttempts: 3,
  backoffStrategy: QueueBackoffStrategy.EXPONENTIAL,
  backoffBaseSeconds: 60,
  backoffMaxSeconds: 3600,
  retryOn: [...DEFAULT_RETRY_ON] as CallFailureCode[],
  /** Prefer small claims; dialer re-checks slots before each dial. */
  claimBatchSize: 1,
  quietHoursTimezone: 'UTC',
  dialerIntervalMs: 2000,
  claimLeaseSeconds: 120,
  /**
   * Max age of dialing rows without worker complete before fail/requeue.
   * Covers ring + agent join lag; raise if providers ring longer.
   */
  staleDialingSeconds: 180,
  /**
   * Max age of ready (answered / in-session) rows without worker complete.
   * Aligns with LiveKit room emptyTimeout (15m). Raise for long live calls.
   */
  staleReadySeconds: 900,
  /** Cap reaps per dialer tick so one tick cannot thrash LiveKit. */
  staleInFlightBatchSize: 50,
} as const;
