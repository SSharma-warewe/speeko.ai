import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { CallStatus } from '../../calls/call.entity';
import { CallBatch, CallBatchStatus } from '../call-batch.entity';
import { CallBatchesService } from '../call-batches.service';

describe('CallBatchesService', () => {
  const ORG_ID = 'org-1';
  const OTHER_ORG = 'org-other';
  const BATCH_ID = 'batch-1';
  const AGENT_ID = 'agent-1';
  const TRUNK_ID = 'trunk-1';

  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    findByOrganization: jest.Mock;
    findByIdAndOrganization: jest.Mock;
  };
  let dataSource: { query: jest.Mock };
  let service: CallBatchesService;

  function makeBatch(overrides: Partial<CallBatch> = {}): CallBatch {
    return {
      id: BATCH_ID,
      organizationId: ORG_ID,
      status: CallBatchStatus.RUNNING,
      organizationAgentId: AGENT_ID,
      sipTrunkId: TRUNK_ID,
      taskKey: 'general',
      maxAttempts: 3,
      maxConcurrent: null,
      priority: 0,
      totalCount: 10,
      pausedAt: null,
      cancelledAt: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      ...overrides,
    } as CallBatch;
  }

  beforeEach(() => {
    repo = {
      create: jest.fn((data) => ({ ...data }) as CallBatch),
      save: jest.fn(async (row: CallBatch) => ({ ...row })),
      findByOrganization: jest.fn(),
      findByIdAndOrganization: jest.fn(),
    };
    dataSource = { query: jest.fn() };
    service = new CallBatchesService(repo as never, dataSource as never);
  });

  it('1. createBatch saves running batch with input fields', async () => {
    const saved = await service.createBatch({
      id: BATCH_ID,
      organizationId: ORG_ID,
      organizationAgentId: AGENT_ID,
      sipTrunkId: TRUNK_ID,
      taskKey: 'demo_booking',
      maxAttempts: 5,
      maxConcurrent: 2,
      priority: 10,
      totalCount: 3,
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: BATCH_ID,
        organizationId: ORG_ID,
        status: CallBatchStatus.RUNNING,
        taskKey: 'demo_booking',
        maxAttempts: 5,
        maxConcurrent: 2,
        priority: 10,
        totalCount: 3,
        pausedAt: null,
        cancelledAt: null,
      }),
    );
    expect(saved.status).toBe(CallBatchStatus.RUNNING);
  });

  it('2. listForOrg maps batches via mapper', async () => {
    const batch = makeBatch();
    repo.findByOrganization.mockResolvedValue([batch]);
    const result = await service.listForOrg(ORG_ID, 25);
    expect(repo.findByOrganization).toHaveBeenCalledWith(ORG_ID, 25);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: BATCH_ID,
      organizationId: ORG_ID,
      status: CallBatchStatus.RUNNING,
      totalCount: 10,
    });
    expect(result[0]).not.toHaveProperty('stats');
  });

  it('3. getForOrg not found throws NotFoundException', async () => {
    repo.findByIdAndOrganization.mockResolvedValue(null);
    await expect(service.getForOrg(ORG_ID, BATCH_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('4. getForOrg includes per-status stats', async () => {
    repo.findByIdAndOrganization.mockResolvedValue(makeBatch());
    dataSource.query.mockResolvedValue([
      { status: CallStatus.PENDING, cnt: 2 },
      { status: CallStatus.COMPLETED, cnt: 5 },
      { status: CallStatus.FAILED, cnt: 1 },
    ]);
    const result = await service.getForOrg(ORG_ID, BATCH_ID);
    expect(result.stats).toEqual({
      pending: 2,
      creating: 0,
      dialing: 0,
      ready: 0,
      completed: 5,
      incomplete: 0,
      failed: 1,
      cancelled: 0,
    });
  });

  it('5. pause running → paused with pausedAt', async () => {
    repo.findByIdAndOrganization.mockResolvedValue(makeBatch());
    const result = await service.pause(ORG_ID, BATCH_ID);
    expect(result.status).toBe(CallBatchStatus.PAUSED);
    expect(result.pausedAt).toBeInstanceOf(Date);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: CallBatchStatus.PAUSED }),
    );
  });

  it('6. pause cancelled/completed throws BadRequestException', async () => {
    repo.findByIdAndOrganization.mockResolvedValue(
      makeBatch({ status: CallBatchStatus.CANCELLED }),
    );
    await expect(service.pause(ORG_ID, BATCH_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    repo.findByIdAndOrganization.mockResolvedValue(
      makeBatch({ status: CallBatchStatus.COMPLETED }),
    );
    await expect(service.pause(ORG_ID, BATCH_ID)).rejects.toThrow(
      /completed/i,
    );
  });

  it('7. resume paused → running and clears pausedAt', async () => {
    repo.findByIdAndOrganization.mockResolvedValue(
      makeBatch({
        status: CallBatchStatus.PAUSED,
        pausedAt: new Date('2024-01-02T00:00:00.000Z'),
      }),
    );
    const result = await service.resume(ORG_ID, BATCH_ID);
    expect(result.status).toBe(CallBatchStatus.RUNNING);
    expect(result.pausedAt).toBeNull();
  });

  it('8. resume cancelled/completed throws BadRequestException', async () => {
    repo.findByIdAndOrganization.mockResolvedValue(
      makeBatch({ status: CallBatchStatus.CANCELLED }),
    );
    await expect(service.resume(ORG_ID, BATCH_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    repo.findByIdAndOrganization.mockResolvedValue(
      makeBatch({ status: CallBatchStatus.COMPLETED }),
    );
    await expect(service.resume(ORG_ID, BATCH_ID)).rejects.toThrow(
      /completed/i,
    );
  });

  it('9. cancel already cancelled is idempotent (no pending SQL)', async () => {
    const cancelled = makeBatch({
      status: CallBatchStatus.CANCELLED,
      cancelledAt: new Date('2024-01-03T00:00:00.000Z'),
    });
    repo.findByIdAndOrganization.mockResolvedValue(cancelled);
    const result = await service.cancel(ORG_ID, BATCH_ID);
    expect(result.status).toBe(CallBatchStatus.CANCELLED);
    expect(repo.save).not.toHaveBeenCalled();
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('10. cancel running cancels pending calls for that org+batch only', async () => {
    repo.findByIdAndOrganization.mockResolvedValue(makeBatch());
    dataSource.query.mockResolvedValue([[], 4]);
    const result = await service.cancel(ORG_ID, BATCH_ID);
    expect(result.status).toBe(CallBatchStatus.CANCELLED);
    expect(result.cancelledAt).toBeInstanceOf(Date);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE calls'),
      [
        CallStatus.CANCELLED,
        'cancelled',
        BATCH_ID,
        ORG_ID,
        CallStatus.PENDING,
      ],
    );
  });

  it('11. maybeMarkCompleted does nothing while in-flight calls exist', async () => {
    dataSource.query.mockResolvedValueOnce([{ cnt: 2 }]);
    await service.maybeMarkCompleted(BATCH_ID);
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('12. maybeMarkCompleted marks running batch completed when zero in-flight', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ cnt: 0 }])
      .mockResolvedValueOnce([[], 1]);
    await service.maybeMarkCompleted(BATCH_ID);
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE call_batches'),
      [CallBatchStatus.COMPLETED, BATCH_ID, CallBatchStatus.RUNNING],
    );
  });

  it('13. requireForOrg wrong org throws NotFoundException', async () => {
    repo.findByIdAndOrganization.mockResolvedValue(null);
    await expect(
      service.requireForOrg(OTHER_ORG, BATCH_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findByIdAndOrganization).toHaveBeenCalledWith(
      BATCH_ID,
      OTHER_ORG,
    );
  });
});
