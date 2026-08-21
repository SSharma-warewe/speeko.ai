import { Call, CallStatus, CallTaskStatus } from '../call.entity';
import { CallResponseDto, TestCallResponseDto } from '../dto/call-response.dto';

export function toCallResponse(
  call: Call,
  options: { includeCost?: boolean } = {},
): CallResponseDto {
  const dto: CallResponseDto = {
    id: call.id,
    organizationId: call.organizationId,
    organizationAgentId: call.organizationAgentId,
    agentId: call.agentId,
    sipTrunkId: call.sipTrunkId,
    direction: call.direction,
    status: call.status,
    medium: call.medium,
    roomName: call.roomName,
    livekitDispatchId: call.livekitDispatchId,
    livekitAgentName: call.livekitAgentName,
    livekitSipCallId: call.livekitSipCallId,
    participantIdentity: call.participantIdentity,
    fromNumber: call.fromNumber,
    toNumber: call.toNumber,
    context: call.context,
    taskKey: call.taskKey,
    taskResult: call.taskResult,
    taskStatus: resolveTaskStatus(call),
    transcript: call.transcript,
    usage: call.usage,
    sessionReport: call.sessionReport,
    toolEvents: extractToolEvents(call.sessionReport),
    errorMessage: call.errorMessage,
    attemptCount: call.attemptCount,
    maxAttempts: call.maxAttempts,
    nextAttemptAt: call.nextAttemptAt,
    batchId: call.batchId,
    priority: call.priority ?? 0,
    lastFailureCode: call.lastFailureCode ?? null,
    lastFailureAt: call.lastFailureAt ?? null,
    dialStartedAt: call.dialStartedAt ?? null,
    queueLockedAt: call.queueLockedAt ?? null,
    startedAt: call.startedAt,
    answeredAt: call.answeredAt,
    endedAt: call.endedAt,
    createdAt: call.createdAt,
    updatedAt: call.updatedAt,
  };
  if (options.includeCost !== false) {
    dto.cost = call.cost ?? null;
  }
  return dto;
}

export function toAdminCallResponse(call: Call): CallResponseDto {
  return toCallResponse(call, { includeCost: true });
}

/**
 * Legacy rows created before task_status existed default to pending.
 * A call already stored as completed is a finished workflow for display.
 */
export function resolveTaskStatus(
  call: Pick<Call, 'status' | 'taskStatus'>,
): CallTaskStatus {
  if (
    call.taskStatus === CallTaskStatus.COMPLETED ||
    call.taskStatus === CallTaskStatus.INCOMPLETE
  ) {
    return call.taskStatus;
  }
  if (call.status === CallStatus.COMPLETED) {
    return CallTaskStatus.COMPLETED;
  }
  return call.taskStatus ?? CallTaskStatus.PENDING;
}

/** Pull toolEvents from sessionReport JSONB (worker complete merges them here). */
function extractToolEvents(
  sessionReport: Record<string, unknown> | null | undefined,
): Array<Record<string, unknown>> | null {
  if (!sessionReport || typeof sessionReport !== 'object') return null;
  const raw = sessionReport.toolEvents;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === 'object' && !Array.isArray(item),
  );
}

export function toTestCallResponse(
  call: Call,
  extras: {
    agentKey: string;
    livekitUrl: string;
    participantToken: string;
    meetUrl: string;
  },
  options: { includeCost?: boolean } = {},
): TestCallResponseDto {
  return {
    ...toCallResponse(call, options),
    agentKey: extras.agentKey,
    livekitUrl: extras.livekitUrl,
    participantToken: extras.participantToken,
    meetUrl: extras.meetUrl,
  };
}
