import { Call, CallStatus } from '../../calls/call.entity';
import { OrganizationQueueSettings } from '../organization-queue-settings.entity';
import { QueueDialerService } from '../queue-dialer.service';

describe('QueueDialerService', () => {
  const ORG_ID = 'org-1';
  const CALL_A = 'call-a';
  const CALL_B = 'call-b';

  let config: { get: jest.Mock };
  let settingsService: { findEnabledAndNotPaused: jest.Mock };
  let claimService: {
    reclaimStale: jest.Mock;
    countInProgress: jest.Mock;
    countDialsLastMinute: jest.Mock;
    claimPending: jest.Mock;
    countInProgressExcluding: jest.Mock;
    releaseClaimToPending: jest.Mock;
  };
  let callsService: {
    reapStaleInFlight: jest.Mock;
    dialClaimedCall: jest.Mock;
  };
  let service: QueueDialerService;

  function makeSettings(
    overrides: Partial<OrganizationQueueSettings> = {},
  ): OrganizationQueueSettings {
    return {
      organizationId: ORG_ID,
      enabled: true,
      paused: false,
      maxConcurrent: 2,
      maxDialsPerMinute: 30,
      claimBatchSize: 2,
      ...overrides,
    } as OrganizationQueueSettings;
  }

  function makeCall(id: string): Call {
    return {
      id,
      organizationId: ORG_ID,
      status: CallStatus.CREATING,
      toNumber: '+15551212',
      attemptCount: 1,
      maxAttempts: 3,
    } as Call;
  }

  beforeEach(() => {
    config = { get: jest.fn() };
    settingsService = { findEnabledAndNotPaused: jest.fn().mockResolvedValue([]) };
    claimService = {
      reclaimStale: jest.fn().mockResolvedValue(0),
      countInProgress: jest.fn().mockResolvedValue(0),
      countDialsLastMinute: jest.fn().mockResolvedValue(0),
      claimPending: jest.fn().mockResolvedValue([]),
      countInProgressExcluding: jest.fn().mockResolvedValue(0),
      releaseClaimToPending: jest.fn().mockResolvedValue(true),
    };
    callsService = {
      reapStaleInFlight: jest.fn().mockResolvedValue(undefined),
      dialClaimedCall: jest.fn().mockResolvedValue(undefined),
    };
    service = new QueueDialerService(
      config as never,
      settingsService as never,
      claimService as never,
      callsService as never,
    );
  });

  it('1. QUEUE_DIALER_ENABLED=false skips all work', async () => {
    config.get.mockReturnValue('false');
    await service.tick();
    expect(callsService.reapStaleInFlight).not.toHaveBeenCalled();
    expect(settingsService.findEnabledAndNotPaused).not.toHaveBeenCalled();
  });

  it('1b. QUEUE_DIALER_ENABLED=0 also disables', async () => {
    config.get.mockReturnValue('0');
    await service.tick();
    expect(callsService.reapStaleInFlight).not.toHaveBeenCalled();
  });

  it('2. enabled by default (unset) proceeds to reap + find orgs', async () => {
    config.get.mockReturnValue(undefined);
    settingsService.findEnabledAndNotPaused.mockResolvedValue([]);
    await service.tick();
    expect(callsService.reapStaleInFlight).toHaveBeenCalled();
    expect(settingsService.findEnabledAndNotPaused).toHaveBeenCalled();
    const health = service.getHealth();
    expect(health.globalEnabled).toBe(true);
    expect(health.lastTickAt).toBeInstanceOf(Date);
    expect(health.lastClaimCount).toBe(0);
    expect(health.lastError).toBeNull();
    expect(health.ticking).toBe(false);
  });

  it('3. reentrancy: concurrent tick while first still running is skipped', async () => {
    config.get.mockReturnValue(undefined);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    callsService.reapStaleInFlight.mockImplementation(() => gate);
    settingsService.findEnabledAndNotPaused.mockResolvedValue([]);

    const first = service.tick();
    // Let first enter ticking=true
    await Promise.resolve();
    await service.tick(); // should no-op while first is in flight
    expect(callsService.reapStaleInFlight).toHaveBeenCalledTimes(1);

    release();
    await first;
    expect(service.getHealth().ticking).toBe(false);
  });

  it('4. reapStaleInFlight error is swallowed; tick continues', async () => {
    config.get.mockReturnValue(undefined);
    callsService.reapStaleInFlight.mockRejectedValue(new Error('livekit down'));
    settingsService.findEnabledAndNotPaused.mockResolvedValue([makeSettings()]);
    claimService.countInProgress.mockResolvedValue(0);
    claimService.countDialsLastMinute.mockResolvedValue(0);
    claimService.claimPending.mockResolvedValue([]);

    await service.tick();
    expect(claimService.reclaimStale).toHaveBeenCalledWith(ORG_ID);
    expect(service.getHealth().lastError).toBeNull();
  });

  it('5. no free slots skips claim', async () => {
    config.get.mockReturnValue(undefined);
    settingsService.findEnabledAndNotPaused.mockResolvedValue([
      makeSettings({ maxConcurrent: 2 }),
    ]);
    claimService.countInProgress.mockResolvedValue(2);

    await service.tick();
    expect(claimService.claimPending).not.toHaveBeenCalled();
    expect(claimService.countDialsLastMinute).not.toHaveBeenCalled();
  });

  it('6. rate limit exhausted skips claim', async () => {
    config.get.mockReturnValue(undefined);
    settingsService.findEnabledAndNotPaused.mockResolvedValue([
      makeSettings({ maxConcurrent: 5, maxDialsPerMinute: 10 }),
    ]);
    claimService.countInProgress.mockResolvedValue(0);
    claimService.countDialsLastMinute.mockResolvedValue(10);

    await service.tick();
    expect(claimService.claimPending).not.toHaveBeenCalled();
  });

  it('7. claims then dials each with capacity re-check', async () => {
    config.get.mockReturnValue(undefined);
    const a = makeCall(CALL_A);
    const b = makeCall(CALL_B);
    settingsService.findEnabledAndNotPaused.mockResolvedValue([
      makeSettings({ maxConcurrent: 2, claimBatchSize: 2 }),
    ]);
    claimService.countInProgress.mockResolvedValue(0);
    claimService.countDialsLastMinute.mockResolvedValue(0);
    claimService.claimPending.mockResolvedValue([a, b]);
    claimService.countInProgressExcluding.mockResolvedValue(0);

    await service.tick();

    expect(claimService.claimPending).toHaveBeenCalledWith(ORG_ID, 2);
    expect(callsService.dialClaimedCall).toHaveBeenCalledTimes(2);
    expect(callsService.dialClaimedCall).toHaveBeenCalledWith(a);
    expect(callsService.dialClaimedCall).toHaveBeenCalledWith(b);
    expect(service.getHealth().lastClaimCount).toBe(2);
  });

  it('8. others >= maxConcurrent releases claim instead of dialing', async () => {
    config.get.mockReturnValue(undefined);
    const a = makeCall(CALL_A);
    settingsService.findEnabledAndNotPaused.mockResolvedValue([
      makeSettings({ maxConcurrent: 1 }),
    ]);
    claimService.countInProgress.mockResolvedValue(0);
    claimService.countDialsLastMinute.mockResolvedValue(0);
    claimService.claimPending.mockResolvedValue([a]);
    claimService.countInProgressExcluding.mockResolvedValue(1);

    await service.tick();

    expect(claimService.releaseClaimToPending).toHaveBeenCalledWith(CALL_A);
    expect(callsService.dialClaimedCall).not.toHaveBeenCalled();
  });

  it('9. dial throw is logged; remaining calls continue', async () => {
    config.get.mockReturnValue(undefined);
    const a = makeCall(CALL_A);
    const b = makeCall(CALL_B);
    settingsService.findEnabledAndNotPaused.mockResolvedValue([
      makeSettings({ maxConcurrent: 2, claimBatchSize: 2 }),
    ]);
    claimService.countInProgress.mockResolvedValue(0);
    claimService.countDialsLastMinute.mockResolvedValue(0);
    claimService.claimPending.mockResolvedValue([a, b]);
    claimService.countInProgressExcluding.mockResolvedValue(0);
    callsService.dialClaimedCall
      .mockRejectedValueOnce(new Error('sip fail'))
      .mockResolvedValueOnce(undefined);

    await service.tick();

    expect(callsService.dialClaimedCall).toHaveBeenCalledTimes(2);
    expect(service.getHealth().lastError).toBeNull();
    expect(service.getHealth().lastClaimCount).toBe(2);
  });

  it('10. getHealth reflects dialer state after successful tick', async () => {
    config.get.mockReturnValue('true');
    settingsService.findEnabledAndNotPaused.mockResolvedValue([]);
    await service.tick();
    const health = service.getHealth();
    expect(health).toEqual({
      globalEnabled: true,
      lastTickAt: expect.any(Date),
      lastClaimCount: 0,
      lastError: null,
      ticking: false,
    });
  });
});
