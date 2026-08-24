import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CallDialService } from '../../calls/services/call-dial.service';
import { CallFailureService } from '../../calls/services/call-failure.service';
import { Call, CallStatus } from '../../calls/call.entity';
import { OrganizationQueueSettings } from '../organization-queue-settings.entity';
import { OrganizationQueueSettingsService } from '../organization-queue-settings.service';
import { QueueClaimService } from '../queue-claim.service';
import { QueueDialerService } from '../queue-dialer.service';
import { QUEUE_DEFAULTS } from '../queue.defaults';

/**
 * Pure unit tests for QueueDialerService.
 * tick() is invoked directly (the @Interval decorator is never started).
 * ConfigService / settings / claim / dial / failure are all mocks — no DB, HTTP, or SIP.
 */
describe('QueueDialerService', () => {
  const ORG_A = 'org-a';
  const ORG_B = 'org-b';
  const CALL_A = 'call-a';
  const CALL_B = 'call-b';
  const CALL_C = 'call-c';

  /** Fake-timer delay used in the 30-job feed so dials are not instantaneous. */
  const DIAL_DELAY_MS = 80;

  let moduleRef: TestingModule;
  let service: QueueDialerService;

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
  let callDial: {
    dialClaimedCall: jest.Mock;
  };
  let callFailure: {
    reapStaleInFlight: jest.Mock;
  };

  function makeSettings(
    organizationId: string,
    overrides: Partial<OrganizationQueueSettings> = {},
  ): OrganizationQueueSettings {
    return {
      organizationId,
      enabled: true,
      paused: false,
      maxConcurrent: 2,
      maxDialsPerMinute: 30,
      claimBatchSize: 2,
      ...overrides,
    } as OrganizationQueueSettings;
  }

  function makeCall(
    id: string,
    organizationId = ORG_A,
    overrides: Partial<Call> = {},
  ): Call {
    return {
      id,
      organizationId,
      status: CallStatus.CREATING,
      toNumber: '+15551212',
      attemptCount: 1,
      maxAttempts: 3,
      ...overrides,
    } as Call;
  }

  /** Drain pending microtasks so an in-flight tick() can set `ticking` / hit a mock. */
  async function flushMicrotasks(times = 40): Promise<void> {
    for (let i = 0; i < times; i++) {
      await Promise.resolve();
    }
  }

  async function waitFor(predicate: () => boolean, spins = 80): Promise<void> {
    for (let i = 0; i < spins; i++) {
      if (predicate()) {
        return;
      }
      await Promise.resolve();
    }
    throw new Error('waitFor timed out before predicate became true');
  }

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    config = { get: jest.fn().mockReturnValue(undefined) };
    settingsService = {
      findEnabledAndNotPaused: jest.fn().mockResolvedValue([]),
    };
    claimService = {
      reclaimStale: jest.fn().mockResolvedValue(0),
      countInProgress: jest.fn().mockResolvedValue(0),
      countDialsLastMinute: jest.fn().mockResolvedValue(0),
      claimPending: jest.fn().mockResolvedValue([]),
      countInProgressExcluding: jest.fn().mockResolvedValue(0),
      releaseClaimToPending: jest.fn().mockResolvedValue(true),
    };
    callDial = {
      dialClaimedCall: jest.fn().mockResolvedValue(undefined),
    };
    callFailure = {
      reapStaleInFlight: jest.fn().mockResolvedValue(undefined),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        QueueDialerService,
        { provide: ConfigService, useValue: config },
        { provide: OrganizationQueueSettingsService, useValue: settingsService },
        { provide: QueueClaimService, useValue: claimService },
        { provide: CallDialService, useValue: callDial },
        { provide: CallFailureService, useValue: callFailure },
      ],
    }).compile();

    service = moduleRef.get(QueueDialerService);
  });

  afterEach(async () => {
    jest.useRealTimers();
    await moduleRef?.close();
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Feature flag
  // ---------------------------------------------------------------------------
  describe('1. Feature flag', () => {
    it("returns immediately when QUEUE_DIALER_ENABLED is 'false'", async () => {
      config.get.mockReturnValue('false');

      await service.tick();

      expect(config.get).toHaveBeenCalledWith('QUEUE_DIALER_ENABLED');
      expect(callFailure.reapStaleInFlight).not.toHaveBeenCalled();
      expect(settingsService.findEnabledAndNotPaused).not.toHaveBeenCalled();
      expect(claimService.claimPending).not.toHaveBeenCalled();
      expect(callDial.dialClaimedCall).not.toHaveBeenCalled();
    });

    it("returns immediately when QUEUE_DIALER_ENABLED is '0'", async () => {
      config.get.mockReturnValue('0');

      await service.tick();

      expect(callFailure.reapStaleInFlight).not.toHaveBeenCalled();
      expect(settingsService.findEnabledAndNotPaused).not.toHaveBeenCalled();
      expect(claimService.claimPending).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Mutex / already ticking
  // ---------------------------------------------------------------------------
  describe('2. Mutex / already ticking', () => {
    it('returns immediately when this.ticking is already true', async () => {
      (service as unknown as { ticking: boolean }).ticking = true;

      await service.tick();

      expect(callFailure.reapStaleInFlight).not.toHaveBeenCalled();
      expect(settingsService.findEnabledAndNotPaused).not.toHaveBeenCalled();
      expect(claimService.claimPending).not.toHaveBeenCalled();
    });

    it('skips a second overlapping tick() while the first is still running', async () => {
      let releaseReap!: () => void;
      const reapGate = new Promise<void>((resolve) => {
        releaseReap = resolve;
      });
      callFailure.reapStaleInFlight.mockImplementation(() => reapGate);
      settingsService.findEnabledAndNotPaused.mockResolvedValue([]);

      const first = service.tick();
      await waitFor(() => callFailure.reapStaleInFlight.mock.calls.length === 1);
      expect(service.getHealth().ticking).toBe(true);

      await service.tick();
      expect(callFailure.reapStaleInFlight).toHaveBeenCalledTimes(1);
      expect(settingsService.findEnabledAndNotPaused).not.toHaveBeenCalled();

      releaseReap();
      await first;

      expect(service.getHealth().ticking).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Capacity calculation
  // ---------------------------------------------------------------------------
  describe('3. Capacity calculation', () => {
    it('never calls claimPending when there are no free concurrent slots', async () => {
      settingsService.findEnabledAndNotPaused.mockResolvedValue([
        makeSettings(ORG_A, { maxConcurrent: 2 }),
      ]);
      claimService.countInProgress.mockResolvedValue(2);

      await service.tick();

      expect(claimService.reclaimStale).toHaveBeenCalledWith(ORG_A);
      expect(claimService.countInProgress).toHaveBeenCalledWith(ORG_A);
      expect(claimService.countDialsLastMinute).not.toHaveBeenCalled();
      expect(claimService.claimPending).not.toHaveBeenCalled();
      expect(callDial.dialClaimedCall).not.toHaveBeenCalled();
    });

    it('never calls claimPending when maxDialsPerMinute is exhausted', async () => {
      settingsService.findEnabledAndNotPaused.mockResolvedValue([
        makeSettings(ORG_A, { maxConcurrent: 5, maxDialsPerMinute: 10 }),
      ]);
      claimService.countInProgress.mockResolvedValue(0);
      claimService.countDialsLastMinute.mockResolvedValue(10);

      await service.tick();

      expect(claimService.countDialsLastMinute).toHaveBeenCalledWith(ORG_A);
      expect(claimService.claimPending).not.toHaveBeenCalled();
      expect(callDial.dialClaimedCall).not.toHaveBeenCalled();
    });

    it('claims min(free slots, rate remaining, claimBatchSize)', async () => {
      // slots = 8 - 2 = 6; rate remaining = 20 - 17 = 3; batch = 10 → min = 3
      settingsService.findEnabledAndNotPaused.mockResolvedValue([
        makeSettings(ORG_A, {
          maxConcurrent: 8,
          maxDialsPerMinute: 20,
          claimBatchSize: 10,
        }),
      ]);
      claimService.countInProgress.mockResolvedValue(2);
      claimService.countDialsLastMinute.mockResolvedValue(17);
      claimService.claimPending.mockResolvedValue([]);

      await service.tick();

      expect(claimService.claimPending).toHaveBeenCalledTimes(1);
      expect(claimService.claimPending).toHaveBeenCalledWith(ORG_A, 3);
    });

    it('uses claimBatchSize as the min when it is the smallest bound', async () => {
      // slots = 10; rate remaining = 30; batch = 2 → min = 2
      settingsService.findEnabledAndNotPaused.mockResolvedValue([
        makeSettings(ORG_A, {
          maxConcurrent: 10,
          maxDialsPerMinute: 30,
          claimBatchSize: 2,
        }),
      ]);
      claimService.countInProgress.mockResolvedValue(0);
      claimService.countDialsLastMinute.mockResolvedValue(0);
      claimService.claimPending.mockResolvedValue([]);

      await service.tick();

      expect(claimService.claimPending).toHaveBeenCalledWith(ORG_A, 2);
    });

    it('falls back to QUEUE_DEFAULTS.claimBatchSize when claimBatchSize is 0', async () => {
      settingsService.findEnabledAndNotPaused.mockResolvedValue([
        makeSettings(ORG_A, {
          maxConcurrent: 10,
          maxDialsPerMinute: 30,
          claimBatchSize: 0,
        }),
      ]);
      claimService.countInProgress.mockResolvedValue(0);
      claimService.countDialsLastMinute.mockResolvedValue(0);
      claimService.claimPending.mockResolvedValue([]);

      await service.tick();

      expect(claimService.claimPending).toHaveBeenCalledWith(
        ORG_A,
        QUEUE_DEFAULTS.claimBatchSize,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Happy path
  // ---------------------------------------------------------------------------
  describe('4. Happy path', () => {
    it('claims the computed limit and dials each claimed call', async () => {
      const a = makeCall(CALL_A);
      const b = makeCall(CALL_B);
      settingsService.findEnabledAndNotPaused.mockResolvedValue([
        makeSettings(ORG_A, {
          maxConcurrent: 2,
          maxDialsPerMinute: 30,
          claimBatchSize: 2,
        }),
      ]);
      claimService.countInProgress.mockResolvedValue(0);
      claimService.countDialsLastMinute.mockResolvedValue(0);
      claimService.claimPending.mockResolvedValue([a, b]);
      claimService.countInProgressExcluding.mockResolvedValue(0);

      await service.tick();

      expect(claimService.reclaimStale).toHaveBeenCalledWith(ORG_A);
      expect(claimService.claimPending).toHaveBeenCalledWith(ORG_A, 2);
      expect(callDial.dialClaimedCall).toHaveBeenCalledTimes(2);
      expect(callDial.dialClaimedCall).toHaveBeenNthCalledWith(1, a);
      expect(callDial.dialClaimedCall).toHaveBeenNthCalledWith(2, b);
      expect(claimService.releaseClaimToPending).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Critical safety path
  // ---------------------------------------------------------------------------
  describe('5. Critical safety path', () => {
    it('releases the claim and does not dial when re-check shows maxConcurrent is full', async () => {
      const a = makeCall(CALL_A);
      settingsService.findEnabledAndNotPaused.mockResolvedValue([
        makeSettings(ORG_A, { maxConcurrent: 1, claimBatchSize: 1 }),
      ]);
      claimService.countInProgress.mockResolvedValue(0);
      claimService.countDialsLastMinute.mockResolvedValue(0);
      claimService.claimPending.mockResolvedValue([a]);
      // Other in-flight legs already occupy the only SIP slot.
      claimService.countInProgressExcluding.mockResolvedValue(1);

      await service.tick();

      expect(claimService.countInProgressExcluding).toHaveBeenCalledWith(
        ORG_A,
        CALL_A,
      );
      expect(claimService.releaseClaimToPending).toHaveBeenCalledWith(CALL_A);
      expect(callDial.dialClaimedCall).not.toHaveBeenCalled();
    });

    it('only defers the over-capacity call; later claimed calls can still dial', async () => {
      const a = makeCall(CALL_A);
      const b = makeCall(CALL_B);
      settingsService.findEnabledAndNotPaused.mockResolvedValue([
        makeSettings(ORG_A, { maxConcurrent: 1, claimBatchSize: 2 }),
      ]);
      claimService.countInProgress.mockResolvedValue(0);
      claimService.countDialsLastMinute.mockResolvedValue(0);
      claimService.claimPending.mockResolvedValue([a, b]);
      claimService.countInProgressExcluding
        .mockResolvedValueOnce(1) // A: slot full → release
        .mockResolvedValueOnce(0); // B: slot free → dial

      await service.tick();

      expect(claimService.releaseClaimToPending).toHaveBeenCalledWith(CALL_A);
      expect(claimService.releaseClaimToPending).not.toHaveBeenCalledWith(
        CALL_B,
      );
      expect(callDial.dialClaimedCall).toHaveBeenCalledTimes(1);
      expect(callDial.dialClaimedCall).toHaveBeenCalledWith(b);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Error isolation
  // ---------------------------------------------------------------------------
  describe('6. Error isolation', () => {
    it('still processes later organizations when one org throws', async () => {
      const settingsA = makeSettings(ORG_A);
      const settingsB = makeSettings(ORG_B, { organizationId: ORG_B });
      const callB = makeCall(CALL_B, ORG_B);

      settingsService.findEnabledAndNotPaused.mockResolvedValue([
        settingsA,
        settingsB,
      ]);
      claimService.reclaimStale.mockImplementation(async (orgId: string) => {
        if (orgId === ORG_A) {
          throw new Error('org-a reclaim boom');
        }
        return 0;
      });
      claimService.countInProgress.mockResolvedValue(0);
      claimService.countDialsLastMinute.mockResolvedValue(0);
      claimService.claimPending.mockImplementation(async (orgId: string) => {
        return orgId === ORG_B ? [callB] : [];
      });
      claimService.countInProgressExcluding.mockResolvedValue(0);

      await service.tick();

      expect(claimService.reclaimStale).toHaveBeenCalledWith(ORG_A);
      expect(claimService.reclaimStale).toHaveBeenCalledWith(ORG_B);
      expect(claimService.claimPending).not.toHaveBeenCalledWith(
        ORG_A,
        expect.anything(),
      );
      expect(claimService.claimPending).toHaveBeenCalledWith(ORG_B, 2);
      expect(callDial.dialClaimedCall).toHaveBeenCalledWith(callB);
      expect(service.getHealth().lastError).toBeNull();
    });

    it('continues remaining claimed calls when dialClaimedCall throws', async () => {
      const a = makeCall(CALL_A);
      const b = makeCall(CALL_B);
      const c = makeCall(CALL_C);
      settingsService.findEnabledAndNotPaused.mockResolvedValue([
        makeSettings(ORG_A, { maxConcurrent: 3, claimBatchSize: 3 }),
      ]);
      claimService.countInProgress.mockResolvedValue(0);
      claimService.countDialsLastMinute.mockResolvedValue(0);
      claimService.claimPending.mockResolvedValue([a, b, c]);
      claimService.countInProgressExcluding.mockResolvedValue(0);
      callDial.dialClaimedCall
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('sip fail on B'))
        .mockResolvedValueOnce(undefined);

      await service.tick();

      expect(callDial.dialClaimedCall).toHaveBeenCalledTimes(3);
      expect(callDial.dialClaimedCall).toHaveBeenNthCalledWith(1, a);
      expect(callDial.dialClaimedCall).toHaveBeenNthCalledWith(2, b);
      expect(callDial.dialClaimedCall).toHaveBeenNthCalledWith(3, c);
      expect(service.getHealth().lastError).toBeNull();
      expect(service.getHealth().lastClaimCount).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Health endpoint
  // ---------------------------------------------------------------------------
  describe('7. Health endpoint', () => {
    it('reflects lastTickAt, lastClaimCount, lastError=null, ticking=false after a successful tick', async () => {
      const a = makeCall(CALL_A);
      const b = makeCall(CALL_B);
      settingsService.findEnabledAndNotPaused.mockResolvedValue([
        makeSettings(ORG_A, { maxConcurrent: 2, claimBatchSize: 2 }),
      ]);
      claimService.countInProgress.mockResolvedValue(0);
      claimService.countDialsLastMinute.mockResolvedValue(0);
      claimService.claimPending.mockResolvedValue([a, b]);
      claimService.countInProgressExcluding.mockResolvedValue(0);

      const before = Date.now();
      await service.tick();
      const after = Date.now();

      const health = service.getHealth();
      expect(health.ticking).toBe(false);
      expect(health.lastError).toBeNull();
      expect(health.lastClaimCount).toBe(2);
      expect(health.lastTickAt).toBeInstanceOf(Date);
      expect(health.lastTickAt!.getTime()).toBeGreaterThanOrEqual(before);
      expect(health.lastTickAt!.getTime()).toBeLessThanOrEqual(after);
      expect(health.globalEnabled).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Feeding 30 jobs with timeout
  // ---------------------------------------------------------------------------
  describe('8. Feeding 30 jobs with timeout', () => {
    const JOB_COUNT = 30;
    const MAX_CONCURRENT = 3;
    const MAX_DIALS_PER_MINUTE = 10;
    const CLAIM_BATCH_SIZE = 8;

    type JobSim = {
      pending: Call[];
      inFlight: Set<string>;
      claimedIds: string[];
      dialedIds: string[];
      claimLimits: number[];
      claimTimestamps: number[];
      seenClaim: Set<string>;
    };

    function seedJobs(): Call[] {
      return Array.from({ length: JOB_COUNT }, (_, i) =>
        makeCall(`job-${String(i + 1).padStart(2, '0')}`),
      );
    }

    /**
     * In-memory pending queue + in-flight set. claimPending dequeues up to
     * `limit`; dialClaimedCall waits DIAL_DELAY_MS (fake timers) then frees
     * the slot. countDialsLastMinute uses a rolling 60s window on Date.now().
     */
    function installJobSimulation(jobs: Call[]): JobSim {
      const sim: JobSim = {
        pending: [...jobs],
        inFlight: new Set<string>(),
        claimedIds: [],
        dialedIds: [],
        claimLimits: [],
        claimTimestamps: [],
        seenClaim: new Set<string>(),
      };

      settingsService.findEnabledAndNotPaused.mockResolvedValue([
        makeSettings(ORG_A, {
          maxConcurrent: MAX_CONCURRENT,
          maxDialsPerMinute: MAX_DIALS_PER_MINUTE,
          claimBatchSize: CLAIM_BATCH_SIZE,
        }),
      ]);

      claimService.countInProgress.mockImplementation(async () => sim.inFlight.size);

      claimService.countDialsLastMinute.mockImplementation(async () => {
        const cutoff = Date.now() - 60_000;
        return sim.claimTimestamps.filter((ts) => ts >= cutoff).length;
      });

      claimService.countInProgressExcluding.mockImplementation(
        async (_org: string, excludeCallId: string) => {
          let n = 0;
          for (const id of sim.inFlight) {
            if (id !== excludeCallId) {
              n += 1;
            }
          }
          return n;
        },
      );

      claimService.claimPending.mockImplementation(
        async (_org: string, limit: number) => {
          sim.claimLimits.push(limit);

          const inProgress = sim.inFlight.size;
          const dialsLastMin = sim.claimTimestamps.filter(
            (ts) => ts >= Date.now() - 60_000,
          ).length;
          const slots = Math.max(0, MAX_CONCURRENT - inProgress);
          const rateRemaining = Math.max(0, MAX_DIALS_PER_MINUTE - dialsLastMin);

          expect(limit).toBeGreaterThan(0);
          expect(limit).toBeLessThanOrEqual(slots);
          expect(limit).toBeLessThanOrEqual(rateRemaining);
          expect(limit).toBeLessThanOrEqual(CLAIM_BATCH_SIZE);
          expect(limit).toBe(
            Math.min(slots, rateRemaining, CLAIM_BATCH_SIZE),
          );

          const taken = sim.pending.splice(0, Math.min(limit, sim.pending.length));
          const now = Date.now();
          for (const call of taken) {
            if (sim.seenClaim.has(call.id)) {
              throw new Error(`Double-claim of ${call.id}`);
            }
            sim.seenClaim.add(call.id);
            sim.inFlight.add(call.id);
            sim.claimedIds.push(call.id);
            sim.claimTimestamps.push(now);
          }
          return taken;
        },
      );

      claimService.releaseClaimToPending.mockImplementation(
        async (callId: string) => {
          sim.inFlight.delete(callId);
          sim.seenClaim.delete(callId);
          const call = jobs.find((j) => j.id === callId);
          if (call) {
            sim.pending.unshift(call);
          }
          return true;
        },
      );

      callDial.dialClaimedCall.mockImplementation(async (call: Call) => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, DIAL_DELAY_MS);
        });
        sim.inFlight.delete(call.id);
        sim.dialedIds.push(call.id);
      });

      return sim;
    }

    async function runTick(): Promise<void> {
      const pending = service.tick();
      await jest.runAllTimersAsync();
      await pending;
    }

    it('claims in capacity-respecting batches and eventually dials all 30 jobs once', async () => {
      jest.useFakeTimers();
      const jobs = seedJobs();
      const sim = installJobSimulation(jobs);

      let ticks = 0;
      const maxTicks = 80;
      while (sim.dialedIds.length < JOB_COUNT && ticks < maxTicks) {
        ticks += 1;
        const claimedBefore = sim.claimedIds.length;
        await runTick();
        const claimedThisTick = sim.claimedIds.length - claimedBefore;

        // Rate window exhausted: roll a minute so remaining jobs can be claimed.
        if (claimedThisTick === 0 && sim.pending.length > 0) {
          await jest.advanceTimersByTimeAsync(60_000);
        }
      }

      expect(sim.dialedIds).toHaveLength(JOB_COUNT);
      expect(sim.claimedIds).toHaveLength(JOB_COUNT);
      expect(sim.pending).toHaveLength(0);
      expect(sim.inFlight.size).toBe(0);

      expect(new Set(sim.dialedIds).size).toBe(JOB_COUNT);
      expect(new Set(sim.claimedIds).size).toBe(JOB_COUNT);
      expect(sim.dialedIds).toEqual(sim.claimedIds);
      expect([...sim.dialedIds].sort()).toEqual(
        jobs.map((j) => j.id).sort(),
      );

      // Every claim request was min(slots, rate remaining, batch) — asserted
      // inside the mock — and never asked for more than either limiter.
      expect(sim.claimLimits.length).toBeGreaterThan(0);
      for (const limit of sim.claimLimits) {
        expect(limit).toBeLessThanOrEqual(MAX_CONCURRENT);
        expect(limit).toBeLessThanOrEqual(MAX_DIALS_PER_MINUTE);
        expect(limit).toBeLessThanOrEqual(CLAIM_BATCH_SIZE);
      }

      // 10 dials/min + batch of 3 concurrent ⇒ 3,3,3,1 per window, three windows.
      expect(sim.claimLimits).toEqual([3, 3, 3, 1, 3, 3, 3, 1, 3, 3, 3, 1]);
      expect(ticks).toBeLessThan(maxTicks);
      expect(service.getHealth().ticking).toBe(false);
      expect(service.getHealth().lastError).toBeNull();
      expect(service.getHealth().lastClaimCount).toBe(1);
    });

    it('holds the ticking mutex while delayed dials are still in progress', async () => {
      jest.useFakeTimers();
      const jobs = seedJobs();
      const sim = installJobSimulation(jobs);

      let releaseFirstDial!: () => void;
      const firstDialHold = new Promise<void>((resolve) => {
        releaseFirstDial = resolve;
      });
      let enteredFirstDial = false;

      callDial.dialClaimedCall.mockImplementation(async (call: Call) => {
        if (!enteredFirstDial) {
          enteredFirstDial = true;
          await firstDialHold;
        }
        await new Promise<void>((resolve) => {
          setTimeout(resolve, DIAL_DELAY_MS);
        });
        sim.inFlight.delete(call.id);
        sim.dialedIds.push(call.id);
      });

      const first = service.tick();
      await waitFor(() => enteredFirstDial);
      expect(service.getHealth().ticking).toBe(true);
      expect(claimService.claimPending).toHaveBeenCalledTimes(1);

      await service.tick();
      await flushMicrotasks();
      expect(claimService.claimPending).toHaveBeenCalledTimes(1);
      expect(service.getHealth().ticking).toBe(true);

      releaseFirstDial();
      await flushMicrotasks();
      await jest.runAllTimersAsync();
      await first;

      expect(service.getHealth().ticking).toBe(false);
      expect(sim.dialedIds.length).toBeGreaterThan(0);
      expect(sim.claimedIds).toHaveLength(MAX_CONCURRENT);
    });
  });
});
