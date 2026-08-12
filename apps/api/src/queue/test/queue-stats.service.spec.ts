import { CallStatus } from '../../calls/call.entity';
import { CallBatchStatus } from '../call-batch.entity';
import { OrganizationQueueSettings } from '../organization-queue-settings.entity';
import { QueueStatsService } from '../queue-stats.service';

describe('QueueStatsService', () => {
  const ORG_ID = 'org-1';
  const ORG_B = 'org-2';

  let dataSource: { query: jest.Mock };
  let settingsService: {
    getOrCreate: jest.Mock;
    findAll: jest.Mock;
  };
  let claimService: { countDialsLastMinute: jest.Mock };
  let dialer: { getHealth: jest.Mock };
  let batchesRepo: { countByOrganizationAndStatus: jest.Mock };
  let service: QueueStatsService;

  const dialerHealth = {
    globalEnabled: true,
    lastTickAt: new Date('2024-06-01T00:00:00.000Z'),
    lastClaimCount: 3,
    lastError: null as string | null,
    ticking: false,
  };

  function makeSettings(
    orgId: string,
    overrides: Partial<OrganizationQueueSettings> = {},
  ): OrganizationQueueSettings {
    return {
      organizationId: orgId,
      enabled: true,
      paused: false,
      maxConcurrent: 5,
      maxDialsPerMinute: 30,
      ...overrides,
    } as OrganizationQueueSettings;
  }

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    settingsService = {
      getOrCreate: jest.fn(),
      findAll: jest.fn(),
    };
    claimService = {
      countDialsLastMinute: jest.fn().mockResolvedValue(2),
    };
    dialer = {
      getHealth: jest.fn(() => dialerHealth),
    };
    batchesRepo = {
      countByOrganizationAndStatus: jest.fn().mockResolvedValue(0),
    };
    service = new QueueStatsService(
      dataSource as never,
      settingsService as never,
      claimService as never,
      dialer as never,
      batchesRepo as never,
    );
  });

  function mockOrgQueries(statusRows: Array<{ status: string; cnt: number }>) {
    // forOrganization runs: countByStatus, countPendingReady, countScheduledRetries, avgAttemptCount
    dataSource.query
      .mockResolvedValueOnce(statusRows)
      .mockResolvedValueOnce([{ cnt: 1 }]) // pendingReadyNow
      .mockResolvedValueOnce([{ cnt: 4 }]) // scheduledRetries
      .mockResolvedValueOnce([{ avg: 1.5 }]); // avgAttemptCount
  }

  it('1. forOrganization assembles shape with inProgress and availableSlots', async () => {
    settingsService.getOrCreate.mockResolvedValue(
      makeSettings(ORG_ID, { maxConcurrent: 5, paused: false }),
    );
    mockOrgQueries([
      { status: CallStatus.PENDING, cnt: 10 },
      { status: CallStatus.CREATING, cnt: 1 },
      { status: CallStatus.DIALING, cnt: 1 },
      { status: CallStatus.READY, cnt: 1 },
      { status: CallStatus.COMPLETED, cnt: 20 },
      { status: CallStatus.FAILED, cnt: 2 },
      { status: CallStatus.CANCELLED, cnt: 1 },
    ]);
    batchesRepo.countByOrganizationAndStatus
      .mockResolvedValueOnce(3) // running
      .mockResolvedValueOnce(1); // paused

    const result = await service.forOrganization(ORG_ID);

    expect(result.organizationId).toBe(ORG_ID);
    expect(result.queue).toMatchObject({
      enabled: true,
      paused: false,
      maxConcurrent: 5,
      maxDialsPerMinute: 30,
      inProgress: 3,
      availableSlots: 2,
      dialsLastMinute: 2,
    });
    expect(result.counts).toEqual({
      pending: 10,
      pendingReadyNow: 1,
      creating: 1,
      dialing: 1,
      ready: 1,
      completed: 20,
      failed: 2,
      cancelled: 1,
    });
    expect(result.retries).toEqual({
      scheduled: 4,
      avgAttemptCount: 1.5,
    });
    expect(result.batches).toEqual({ running: 3, paused: 1 });
    expect(result.dialer).toEqual({
      globalEnabled: true,
      lastTickAt: dialerHealth.lastTickAt,
      lastClaimCount: 3,
      lastError: null,
    });
    expect(result.asOf).toBeInstanceOf(Date);
    expect(batchesRepo.countByOrganizationAndStatus).toHaveBeenCalledWith(
      ORG_ID,
      CallBatchStatus.RUNNING,
    );
    expect(batchesRepo.countByOrganizationAndStatus).toHaveBeenCalledWith(
      ORG_ID,
      CallBatchStatus.PAUSED,
    );
  });

  it('2. adminSummary rolls up totals across orgs', async () => {
    settingsService.findAll.mockResolvedValue([
      makeSettings(ORG_ID, { enabled: true, paused: false }),
      makeSettings(ORG_B, { enabled: true, paused: true, maxConcurrent: 2 }),
    ]);

    // First org
    settingsService.getOrCreate
      .mockResolvedValueOnce(
        makeSettings(ORG_ID, { maxConcurrent: 5, enabled: true, paused: false }),
      )
      .mockResolvedValueOnce(
        makeSettings(ORG_B, { maxConcurrent: 2, enabled: true, paused: true }),
      );

    // org1 queries
    dataSource.query
      .mockResolvedValueOnce([
        { status: CallStatus.PENDING, cnt: 5 },
        { status: CallStatus.DIALING, cnt: 2 },
        { status: CallStatus.COMPLETED, cnt: 10 },
        { status: CallStatus.FAILED, cnt: 1 },
      ])
      .mockResolvedValueOnce([{ cnt: 0 }])
      .mockResolvedValueOnce([{ cnt: 0 }])
      .mockResolvedValueOnce([{ avg: 1 }])
      // org2 queries
      .mockResolvedValueOnce([
        { status: CallStatus.PENDING, cnt: 3 },
        { status: CallStatus.READY, cnt: 1 },
        { status: CallStatus.COMPLETED, cnt: 4 },
        { status: CallStatus.CANCELLED, cnt: 2 },
      ])
      .mockResolvedValueOnce([{ cnt: 0 }])
      .mockResolvedValueOnce([{ cnt: 0 }])
      .mockResolvedValueOnce([{ avg: 0 }]);

    batchesRepo.countByOrganizationAndStatus.mockResolvedValue(0);
    claimService.countDialsLastMinute.mockResolvedValue(0);

    const result = await service.adminSummary();

    expect(result.organizations).toHaveLength(2);
    expect(result.totals).toEqual({
      pending: 8,
      inProgress: 3, // 2 dialing + 1 ready
      completed: 14,
      failed: 1,
      cancelled: 2,
      orgsEnabled: 2,
      orgsPaused: 1,
    });
    expect(result.dialer.globalEnabled).toBe(true);
    expect(result.asOf).toBeInstanceOf(Date);
  });

  it('3. zero counts: availableSlots equals maxConcurrent (no NaN)', async () => {
    settingsService.getOrCreate.mockResolvedValue(
      makeSettings(ORG_ID, { maxConcurrent: 3 }),
    );
    dataSource.query
      .mockResolvedValueOnce([]) // no status rows
      .mockResolvedValueOnce([{ cnt: 0 }])
      .mockResolvedValueOnce([{ cnt: 0 }])
      .mockResolvedValueOnce([{ avg: 0 }]);
    claimService.countDialsLastMinute.mockResolvedValue(0);

    const result = await service.forOrganization(ORG_ID);
    expect(result.queue.inProgress).toBe(0);
    expect(result.queue.availableSlots).toBe(3);
    expect(result.counts.pending).toBe(0);
    expect(Number.isNaN(result.retries.avgAttemptCount)).toBe(false);
  });
});
