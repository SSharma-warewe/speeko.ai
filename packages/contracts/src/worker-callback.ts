import type { CallFailureCode, CallTranscriptItem } from './call.js';

/** One worker tool invocation during a call (persisted via complete → sessionReport). */
export type ToolEvent = {
  at: string;
  toolId: string;
  args?: unknown;
  /** Sanitized tool return value (size-capped). */
  result?: unknown;
  ok?: boolean;
  error?: string;
  summary?: string;
  durationMs?: number;
};

/**
 * Worker → API POST /api/internal/calls/:id/complete.
 * `status: completed` means the voice session ended after answer;
 * `taskCompleted` says whether the LiveKit task actually finished.
 * API maps completed+true → completed, completed+false → incomplete.
 */
export type CompleteCallPayload = {
  status: 'completed' | 'failed';
  errorMessage?: string | null;
  failureCode?: CallFailureCode | string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  transcript?: CallTranscriptItem[] | null;
  usage?: Record<string, unknown> | null;
  sessionReport?: Record<string, unknown> | null;
  taskResult?: Record<string, unknown> | null;
  taskCompleted?: boolean;
  toolEvents?: ToolEvent[] | null;
};

/** Worker → API POST /api/internal/calls/inbound (upsert by room name). */
export type InboundEnsurePayload = {
  roomName: string;
  organizationId?: string;
  organizationAgentId?: string;
  agentKey?: string;
  task?: string;
  fromNumber?: string | null;
  toNumber?: string | null;
  participantIdentity?: string | null;
  livekitSipCallId?: string | null;
  livekitTrunkId?: string | null;
  context?: Record<string, unknown> | null;
};
