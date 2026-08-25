import type { CallFailureCode } from '../call.js';
import type { CallBatchStatus, QueueBackoffStrategy } from '../queue.js';

export type QueueSettings = {
  organizationId: string;
  enabled: boolean;
  paused: boolean;
  maxConcurrent: number;
  maxDialsPerMinute: number;
  defaultMaxAttempts: number;
  backoffStrategy: QueueBackoffStrategy;
  backoffBaseSeconds: number;
  backoffMaxSeconds: number;
  retryOn: CallFailureCode[] | string[];
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  quietHoursTimezone: string;
  claimBatchSize: number;
  createdAt: string;
  updatedAt: string;
};

export type UpdateQueueSettingsRequest = Partial<
  Pick<
    QueueSettings,
    | 'enabled'
    | 'paused'
    | 'maxConcurrent'
    | 'maxDialsPerMinute'
    | 'defaultMaxAttempts'
    | 'backoffStrategy'
    | 'backoffBaseSeconds'
    | 'backoffMaxSeconds'
    | 'retryOn'
    | 'quietHoursEnabled'
    | 'quietHoursStart'
    | 'quietHoursEnd'
    | 'quietHoursTimezone'
    | 'claimBatchSize'
  >
>;

export type CallBatch = {
  id: string;
  organizationId: string;
  status: CallBatchStatus;
  organizationAgentId: string | null;
  sipTrunkId: string | null;
  taskKey: string | null;
  maxAttempts: number | null;
  maxConcurrent: number | null;
  priority: number;
  totalCount: number;
  pausedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats?: {
    pending: number;
    creating: number;
    dialing: number;
    ready: number;
    completed: number;
    incomplete?: number;
    failed: number;
    cancelled: number;
  };
};

export type OrgQueueStats = {
  organizationId: string;
  queue: {
    enabled: boolean;
    paused: boolean;
    maxConcurrent: number;
    maxDialsPerMinute: number;
    inProgress: number;
    availableSlots: number;
    dialsLastMinute: number;
  };
  counts: {
    pending: number;
    pendingReadyNow: number;
    creating: number;
    dialing: number;
    ready: number;
    completed: number;
    incomplete?: number;
    failed: number;
    cancelled: number;
  };
  retries: { scheduled: number; avgAttemptCount: number };
  batches: { running: number; paused: number };
  dialer: {
    globalEnabled: boolean;
    lastTickAt: string | null;
    lastClaimCount: number;
    lastError: string | null;
  };
  daily: Array<{
    date: string;
    total: number;
    completed: number;
    incomplete?: number;
    failed: number;
    cancelled: number;
  }>;
  asOf: string;
};

export type AdminQueueStats = {
  totals: {
    pending: number;
    inProgress: number;
    completed: number;
    incomplete?: number;
    failed: number;
    cancelled: number;
    orgsEnabled: number;
    orgsPaused: number;
  };
  dialer: {
    globalEnabled: boolean;
    lastTickAt: string | null;
    lastClaimCount: number;
    lastError: string | null;
  };
  organizations: OrgQueueStats[];
  asOf: string;
};
