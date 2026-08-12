import { CallBatch, CallBatchStatus } from '../call-batch.entity';
import { toCallBatchResponse } from '../mappers/call-batch.mapper';

describe('toCallBatchResponse', () => {
  const batch = {
    id: 'batch-1',
    organizationId: 'org-1',
    status: CallBatchStatus.RUNNING,
    organizationAgentId: 'agent-1',
    sipTrunkId: 'trunk-1',
    taskKey: 'general',
    maxAttempts: 3,
    maxConcurrent: 2,
    priority: 5,
    totalCount: 10,
    pausedAt: null,
    cancelledAt: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  } as CallBatch;

  it('1. maps batch fields 1:1 without stats', () => {
    const dto = toCallBatchResponse(batch);
    expect(dto).toEqual({
      id: 'batch-1',
      organizationId: 'org-1',
      status: CallBatchStatus.RUNNING,
      organizationAgentId: 'agent-1',
      sipTrunkId: 'trunk-1',
      taskKey: 'general',
      maxAttempts: 3,
      maxConcurrent: 2,
      priority: 5,
      totalCount: 10,
      pausedAt: null,
      cancelledAt: null,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    });
    expect(dto).not.toHaveProperty('stats');
  });

  it('2. includes stats only when provided', () => {
    const stats = {
      pending: 1,
      creating: 0,
      dialing: 0,
      ready: 0,
      completed: 2,
      failed: 0,
      cancelled: 0,
    };
    const dto = toCallBatchResponse(batch, stats);
    expect(dto.stats).toEqual(stats);
  });
});
