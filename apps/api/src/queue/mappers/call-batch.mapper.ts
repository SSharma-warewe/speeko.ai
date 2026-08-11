import { CallBatch } from '../call-batch.entity';
import {
  CallBatchResponseDto,
  CallBatchStatsDto,
} from '../dto/call-batch-response.dto';

export function toCallBatchResponse(
  batch: CallBatch,
  stats?: CallBatchStatsDto,
): CallBatchResponseDto {
  return {
    id: batch.id,
    organizationId: batch.organizationId,
    status: batch.status,
    organizationAgentId: batch.organizationAgentId,
    sipTrunkId: batch.sipTrunkId,
    taskKey: batch.taskKey,
    maxAttempts: batch.maxAttempts,
    maxConcurrent: batch.maxConcurrent,
    priority: batch.priority,
    totalCount: batch.totalCount,
    pausedAt: batch.pausedAt,
    cancelledAt: batch.cancelledAt,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    ...(stats ? { stats } : {}),
  };
}
