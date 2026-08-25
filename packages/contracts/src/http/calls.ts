import type { AgentDirection } from '../agent.js';
import type {
  CallBucket,
  CallMedium,
  CallStatus,
  CallTaskStatus,
  CallTranscriptItem,
} from '../call.js';
import type { CallCostSnapshot } from '../price.js';
import type { ToolEvent } from '../worker-callback.js';

export type CallRecord = {
  id: string;
  organizationId: string | null;
  organizationAgentId: string | null;
  agentId: string | null;
  sipTrunkId: string | null;
  batchId?: string | null;
  direction: AgentDirection;
  status: CallStatus | string;
  medium: CallMedium;
  roomName: string | null;
  livekitDispatchId?: string | null;
  livekitAgentName?: string | null;
  livekitSipCallId?: string | null;
  participantIdentity: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  context?: Record<string, unknown> | null;
  taskKey: string | null;
  taskResult: Record<string, unknown> | null;
  taskStatus?: CallTaskStatus;
  transcript: CallTranscriptItem[] | null;
  usage: Record<string, unknown> | null;
  sessionReport?: Record<string, unknown> | null;
  toolEvents?: Array<Partial<ToolEvent> & Record<string, unknown>> | null;
  errorMessage: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt?: string | null;
  priority?: number;
  lastFailureCode: string | null;
  lastFailureAt?: string | null;
  dialStartedAt?: string | null;
  queueLockedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  cost?: CallCostSnapshot | null;
};

export type TestCallResponse = CallRecord & {
  agentKey: string;
  livekitUrl: string;
  participantToken: string;
  meetUrl: string;
};

export type EnqueueCallItem = {
  context: Record<string, unknown>;
  toNumber?: string;
};

export type EnqueueCallsRequest = {
  organizationAgentId: string;
  calls: EnqueueCallItem[];
  task?: string;
  sipTrunkId?: string;
  maxAttempts?: number;
  priority?: number;
  maxConcurrent?: number;
};

export type EnqueueCallsResponse = {
  batchId: string;
  count: number;
  calls: CallRecord[];
};

export type CreateUserOutboundCallRequest = {
  organizationAgentId: string;
  context: Record<string, unknown>;
  task?: string;
  toNumber?: string;
  sipTrunkId?: string;
  waitUntilAnswered?: boolean;
};

export type CreateUserTestCallRequest = {
  organizationAgentId: string;
  task?: string;
  context?: Record<string, unknown>;
};

export type ListCallsQuery = {
  limit?: number;
  bucket?: CallBucket;
  status?: CallStatus | string;
  batchId?: string;
  direction?: AgentDirection;
};

export type UserCallBucket = CallBucket;
