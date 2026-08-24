import { DeepPartial } from 'typeorm';
import {
  Call,
  CallMedium,
  CallStatus,
  CallTaskStatus,
} from '../call.entity';

/**
 * Defaults for a new `calls` row. Callers pass only what differs
 * (ids, direction, medium, numbers, queue fields, …).
 */
export function newCallRow(
  partial: DeepPartial<Call> & Pick<Call, 'direction'>,
): DeepPartial<Call> {
  return {
    organizationId: null,
    organizationAgentId: null,
    agentId: null,
    sipTrunkId: null,
    status: CallStatus.CREATING,
    taskStatus: CallTaskStatus.PENDING,
    medium: CallMedium.WEB,
    roomName: null,
    livekitDispatchId: null,
    livekitAgentName: null,
    livekitSipCallId: null,
    participantIdentity: null,
    fromNumber: null,
    toNumber: null,
    context: null,
    taskKey: null,
    taskResult: null,
    transcript: null,
    usage: null,
    sessionReport: null,
    cost: null,
    costUsd: null,
    errorMessage: null,
    attemptCount: 0,
    maxAttempts: 1,
    nextAttemptAt: null,
    batchId: null,
    priority: 0,
    lastFailureCode: null,
    lastFailureAt: null,
    dialStartedAt: null,
    queueLockedAt: null,
    startedAt: null,
    answeredAt: null,
    endedAt: null,
    ...partial,
  };
}
