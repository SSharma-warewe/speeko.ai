import { Call, CallStatus } from '../../calls/call.entity';
import { CallBatchStatus } from '../call-batch.entity';
import { OrganizationQueueSettings } from '../organization-queue-settings.entity';
import { QUEUE_DEFAULTS } from '../queue.defaults';
import { QueueClaimService } from '../queue-claim.service';

describe('QueueClaimService', () => {
  const ORG_ID = 'org-1';
  const CALL_ID = 'call-1';
  const CALL_ID_2 = 'call-2';

  let dataSource: {
    query: jest.Mock;
    createQueryRunner: jest.Mock;
  };
  let callRepo: {
    count: jest.Mock;
    find: jest.Mock;
  };
  let config: { get: jest.Mock };
  let qr: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    query: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
  };
  let service: QueueClaimService;

  beforeEach(() => {
    qr = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      query: jest.fn(),
      createQueryRunner: jest.fn(() => qr),
    };
    callRepo = {
      count: jest.fn(),
      find: jest.fn(),
    };
    config = { get: jest.fn() };
    service = new QueueClaimService(
      dataSource as never,
      callRepo as never,
      config as never,
    );
  });

  function makeCall(id: string, overrides: Partial<Call> = {}): Call {
    return {
      id,
      organizationId: ORG_ID,
      status: CallStatus.CREATING,
      ...overrides,
    } as Call;
  }

  it('1. countInProgress queries creating/dialing/ready for org', async () => {
    callRepo.count.mockResolvedValue(2);
    await expect(service.countInProgress(ORG_ID)).resolves.toBe(2);
    expect(callRepo.count).toHaveBeenCalledWith({
      where: [
        { organizationId: ORG_ID, status: CallStatus.CREATING },
        { organizationId: ORG_ID, status: CallStatus.DIALING },
        { organizationId: ORG_ID, status: CallStatus.READY },
      ],
    });
  });

  it('2. countInProgressExcluding SQL includes org, exclude id, statuses', async () => {
    dataSource.query.mockResolvedValue([{ cnt: 1 }]);
    await expect(
      service.countInProgressExcluding(ORG_ID, CALL_ID),
    ).resolves.toBe(1);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('organization_id'),
      [
        ORG_ID,
        CALL_ID,
        [CallStatus.CREATING, CallStatus.DIALING, CallStatus.READY],
      ],
    );
  });

  it('3. countDialsLastMinute parses cnt from query result', async () => {
    dataSource.query.mockResolvedValue([{ cnt: 7 }]);
    await expect(service.countDialsLastMinute(ORG_ID)).resolves.toBe(7);
  });

  it('4. releaseClaimToPending returns true when rows affected', async () => {
    // TypeORM/pg shape: [rows, affectedCount]
    dataSource.query.mockResolvedValue([[], 1]);
    await expect(service.releaseClaimToPending(CALL_ID)).resolves.toBe(true);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE calls'),
      [CallStatus.PENDING, CALL_ID, CallStatus.CREATING],
    );
  });

  it('5. releaseClaimToPending returns false when no rows affected', async () => {
    dataSource.query.mockResolvedValue([[], 0]);
    await expect(service.releaseClaimToPending(CALL_ID)).resolves.toBe(false);
  });

  it('6. claimPending limit≤0 returns [] without query runner', async () => {
    await expect(service.claimPending(ORG_ID, 0)).resolves.toEqual([]);
    await expect(service.claimPending(ORG_ID, -1)).resolves.toEqual([]);
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('7. claimPending happy path: select → update creating → ordered find', async () => {
    qr.query
      .mockResolvedValueOnce([{ id: CALL_ID_2 }, { id: CALL_ID }]) // select
      .mockResolvedValueOnce([[], 2]); // update
    const c1 = makeCall(CALL_ID);
    const c2 = makeCall(CALL_ID_2);
    callRepo.find.mockResolvedValue([c1, c2]);

    const result = await service.claimPending(ORG_ID, 2);

    expect(qr.connect).toHaveBeenCalled();
    expect(qr.startTransaction).toHaveBeenCalled();
    expect(qr.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FOR UPDATE OF c SKIP LOCKED'),
      [ORG_ID, CallStatus.PENDING, CallBatchStatus.RUNNING, 2],
    );
    expect(qr.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('attempt_count = attempt_count + 1'),
      [CallStatus.CREATING, [CALL_ID_2, CALL_ID]],
    );
    expect(qr.commitTransaction).toHaveBeenCalled();
    expect(qr.release).toHaveBeenCalled();
    // Preserves claim order (ids from select)
    expect(result.map((c) => c.id)).toEqual([CALL_ID_2, CALL_ID]);
  });

  it('8. claimPending no locked rows commits and returns []', async () => {
    qr.query.mockResolvedValueOnce([]);
    await expect(service.claimPending(ORG_ID, 5)).resolves.toEqual([]);
    expect(qr.commitTransaction).toHaveBeenCalled();
    expect(callRepo.find).not.toHaveBeenCalled();
  });

  it('9. claimPending error rolls back and rethrows; always releases', async () => {
    qr.query.mockRejectedValueOnce(new Error('deadlock'));
    await expect(service.claimPending(ORG_ID, 1)).rejects.toThrow('deadlock');
    expect(qr.rollbackTransaction).toHaveBeenCalled();
    expect(qr.release).toHaveBeenCalled();
  });

  it('10. reclaimStale uses lease env or default 120; returns affected count', async () => {
    config.get.mockReturnValue(undefined);
    dataSource.query.mockResolvedValue([[], 3]);
    await expect(service.reclaimStale(ORG_ID)).resolves.toBe(3);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('Stale claim reclaimed'),
      [
        CallStatus.PENDING,
        'unknown',
        ORG_ID,
        CallStatus.CREATING,
        QUEUE_DEFAULTS.claimLeaseSeconds,
      ],
    );

    config.get.mockImplementation((key: string) =>
      key === 'QUEUE_CLAIM_LEASE_SECONDS' ? '90' : undefined,
    );
    dataSource.query.mockResolvedValue([[], 1]);
    await service.reclaimStale(ORG_ID);
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.arrayContaining([90]),
    );
  });

  it('11. findStaleInFlight loads calls by id with default thresholds', async () => {
    config.get.mockReturnValue(undefined);
    dataSource.query.mockResolvedValue([{ id: CALL_ID }]);
    const call = makeCall(CALL_ID, { status: CallStatus.DIALING });
    callRepo.find.mockResolvedValue([call]);

    const result = await service.findStaleInFlight();
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id'),
      [
        CallStatus.DIALING,
        QUEUE_DEFAULTS.staleDialingSeconds,
        CallStatus.READY,
        QUEUE_DEFAULTS.staleReadySeconds,
        QUEUE_DEFAULTS.staleInFlightBatchSize,
      ],
    );
    expect(result).toEqual([call]);
  });

  it('12. findStaleInFlight empty ids skips find', async () => {
    dataSource.query.mockResolvedValue([]);
    await expect(service.findStaleInFlight()).resolves.toEqual([]);
    expect(callRepo.find).not.toHaveBeenCalled();
  });

  it('13. getStaleInFlightThresholds parses env; invalid falls back', () => {
    config.get.mockReturnValue(undefined);
    expect(service.getStaleInFlightThresholds()).toEqual({
      dialingSeconds: QUEUE_DEFAULTS.staleDialingSeconds,
      readySeconds: QUEUE_DEFAULTS.staleReadySeconds,
    });

    config.get.mockImplementation((key: string) => {
      if (key === 'QUEUE_STALE_DIALING_SECONDS') return '45';
      if (key === 'QUEUE_STALE_READY_SECONDS') return '600';
      return undefined;
    });
    expect(service.getStaleInFlightThresholds()).toEqual({
      dialingSeconds: 45,
      readySeconds: 600,
    });

    config.get.mockImplementation((key: string) => {
      if (key === 'QUEUE_STALE_DIALING_SECONDS') return '0';
      if (key === 'QUEUE_STALE_READY_SECONDS') return 'nope';
      return undefined;
    });
    expect(service.getStaleInFlightThresholds()).toEqual({
      dialingSeconds: QUEUE_DEFAULTS.staleDialingSeconds,
      readySeconds: QUEUE_DEFAULTS.staleReadySeconds,
    });
  });

  it('14. forceRequeueCreating updates creating → pending', async () => {
    dataSource.query.mockResolvedValue([[], 2]);
    await expect(service.forceRequeueCreating(ORG_ID)).resolves.toBe(2);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('Forced requeue of stuck creating'),
      [CallStatus.PENDING, ORG_ID, CallStatus.CREATING],
    );
  });

  it('15. effectiveMaxConcurrent uses min(settings, batch override)', () => {
    const settings = { maxConcurrent: 5 } as OrganizationQueueSettings;
    expect(service.effectiveMaxConcurrent(settings, 2)).toBe(2);
    expect(service.effectiveMaxConcurrent(settings, 10)).toBe(5);
  });

  it('16. effectiveMaxConcurrent null/0 override uses settings', () => {
    const settings = { maxConcurrent: 5 } as OrganizationQueueSettings;
    expect(service.effectiveMaxConcurrent(settings, null)).toBe(5);
    expect(service.effectiveMaxConcurrent(settings, 0)).toBe(5);
    expect(service.effectiveMaxConcurrent(settings, undefined)).toBe(5);
  });
});
