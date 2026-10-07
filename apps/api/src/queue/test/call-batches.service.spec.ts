import { NotFoundException } from '@nestjs/common';
import { CallBatch, CallBatchStatus } from '../call-batch.entity';
import { CallBatchesService } from '../call-batches.service';

describe('CallBatchesService', () => {
  const row = {
    id: 'batch',
    organizationId: 'org',
    status: CallBatchStatus.RUNNING,
  } as CallBatch;
  const repo = {
    create: jest.fn(),
    save: jest.fn(),
    transition: jest.fn(),
    findByOrganization: jest.fn(),
    findByIdAndOrganization: jest.fn(),
  };
  const db = { query: jest.fn() };
  let service: CallBatchesService;
  beforeEach(() => {
    jest.resetAllMocks();
    service = new CallBatchesService(repo as never, db as never);
    repo.create.mockImplementation((data) => data);
    repo.save.mockImplementation(async (data) => data);
    repo.findByIdAndOrganization.mockResolvedValue(row);
  });
  it('creates running batches with their concurrency override', async () => {
    const input = {
      id: 'batch',
      organizationId: 'org',
      organizationAgentId: 'agent',
      sipTrunkId: null,
      taskKey: 'general',
      maxAttempts: 3,
      maxConcurrent: 2,
      priority: 10,
      totalCount: 5,
    };
    expect(await service.createBatch(input)).toMatchObject({
      ...input,
      status: 'running',
      pausedAt: null,
      cancelledAt: null,
    });
  });
  it.each(['pause', 'resume', 'cancel'] as const)(
    '%s uses a complete transactional operation',
    async (action) => {
      repo.transition.mockResolvedValue(row);
      expect(await service[action]('org', 'batch')).toMatchObject({
        id: 'batch',
        organizationId: 'org',
      });
      expect(repo.transition).toHaveBeenCalledWith('org', 'batch', action);
      expect(db.query).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    },
  );
  it('propagates transactional control rejection', async () => {
    repo.transition.mockRejectedValue(new NotFoundException('Batch not found'));
    await expect(service.pause('other-org', 'batch')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  it('scopes list and get to organization', async () => {
    repo.findByOrganization.mockResolvedValue([row]);
    expect(await service.listForOrg('org', 10)).toHaveLength(1);
    expect(repo.findByOrganization).toHaveBeenCalledWith('org', 10);
    db.query.mockResolvedValue([{ status: 'pending', cnt: 2 }]);
    expect(await service.getForOrg('org', 'batch')).toMatchObject({
      stats: { pending: 2 },
    });
    expect(repo.findByIdAndOrganization).toHaveBeenCalledWith('batch', 'org');
  });
  it('missing or foreign batches remain 404', async () => {
    repo.findByIdAndOrganization.mockResolvedValue(null);
    await expect(
      service.requireForOrg('foreign', 'batch'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('does not complete batches with outstanding calls', async () => {
    db.query.mockResolvedValue([{ cnt: 2 }]);
    await service.maybeMarkCompleted('batch');
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('completes running batches once their calls are terminal', async () => {
    db.query.mockResolvedValueOnce([{ cnt: 0 }]).mockResolvedValueOnce([[], 1]);
    await service.maybeMarkCompleted('batch');
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE call_batches'),
      ['completed', 'batch', 'running'],
    );
  });
});
