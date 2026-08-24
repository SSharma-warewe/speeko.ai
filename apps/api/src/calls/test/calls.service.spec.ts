import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AgentDirection } from '../../agents/agent.entity';
import {
  Call,
  CallBucket,
  CallFailureCode,
  CallMedium,
  CallStatus,
  CallTaskStatus,
} from '../call.entity';
import {
  BATCH_ID,
  CALL_ID,
  ORG_AGENT_ID,
  ORG_ID,
  OTHER_ORG_ID,
  PROFILE_ID,
  TEMPLATE_ID,
  TRUNK_ID,
  createCallsHarness,
  orgAgent,
  template,
  trunk,
} from './helpers/calls-mocks';

describe('CallsService', () => {
  let callsRepository: ReturnType<typeof createCallsHarness>['callsRepository'];
  let agentsService: ReturnType<typeof createCallsHarness>['agentsService'];
  let organizationAgentsService: ReturnType<typeof createCallsHarness>['organizationAgentsService'];
  let toolProfilesService: ReturnType<typeof createCallsHarness>['toolProfilesService'];
  let sipTrunksService: ReturnType<typeof createCallsHarness>['sipTrunksService'];
  let priceService: ReturnType<typeof createCallsHarness>['priceService'];
  let livekit: ReturnType<typeof createCallsHarness>['livekit'];
  let queueRetryService: ReturnType<typeof createCallsHarness>['queueRetryService'];
  let queueClaimService: ReturnType<typeof createCallsHarness>['queueClaimService'];
  let callBatchesService: ReturnType<typeof createCallsHarness>['callBatchesService'];
  let webTest: ReturnType<typeof createCallsHarness>['webTest'];
  let dial: ReturnType<typeof createCallsHarness>['dial'];
  let worker: ReturnType<typeof createCallsHarness>['worker'];
  let callFailure: ReturnType<typeof createCallsHarness>['callFailure'];
  let calls: ReturnType<typeof createCallsHarness>['calls'];
  let makeCall: ReturnType<typeof createCallsHarness>['makeCall'];

  beforeEach(() => {
    const h = createCallsHarness();
    callsRepository = h.callsRepository;
    agentsService = h.agentsService;
    organizationAgentsService = h.organizationAgentsService;
    toolProfilesService = h.toolProfilesService;
    sipTrunksService = h.sipTrunksService;
    priceService = h.priceService;
    livekit = h.livekit;
    queueRetryService = h.queueRetryService;
    queueClaimService = h.queueClaimService;
    callBatchesService = h.callBatchesService;
    webTest = h.webTest;
    dial = h.dial;
    worker = h.worker;
    callFailure = h.callFailure;
    calls = h.calls;
    makeCall = h.makeCall;
  });

  describe('cancel / retry / prioritize', () => {
    it('25. cancel pending succeeds and marks batch', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.PENDING,
        batchId: BATCH_ID,
      });
      callsRepository.findByIdAndOrganization.mockResolvedValue(call);

      const result = await calls.cancelPendingForOrg(ORG_ID, CALL_ID);

      expect(result.status).toBe(CallStatus.CANCELLED);
      expect(result.lastFailureCode).toBe(CallFailureCode.CANCELLED);
      expect(callBatchesService.maybeMarkCompleted).toHaveBeenCalledWith(
        BATCH_ID,
      );
    });

    it('26. cancel non-pending rejects', async () => {
      callsRepository.findByIdAndOrganization.mockResolvedValue(
        makeCall({ status: CallStatus.DIALING }),
      );

      await expect(
        calls.cancelPendingForOrg(ORG_ID, CALL_ID),
      ).rejects.toThrow(/Only pending/i);
    });

    it('27. cancel wrong org → 404 (findByIdAndOrganization null)', async () => {
      callsRepository.findByIdAndOrganization.mockResolvedValue(null);

      await expect(
        calls.cancelPendingForOrg(OTHER_ORG_ID, CALL_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('28. retryNow pending bumps nextAttemptAt and priority', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.PENDING,
        priority: 0,
        nextAttemptAt: new Date('2099-01-01T00:00:00.000Z'),
      });
      callsRepository.findByIdAndOrganization.mockResolvedValue(call);

      const result = await calls.retryNowForOrg(ORG_ID, CALL_ID);

      expect(result.status).toBe(CallStatus.PENDING);
      expect(result.priority).toBeGreaterThanOrEqual(10);
      expect(result.nextAttemptAt!.getTime()).toBeLessThan(
        new Date('2099-01-01T00:00:00.000Z').getTime(),
      );
    });

    it('29. retryNow failed reopens as pending and bumps maxAttempts if exhausted', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.FAILED,
        attemptCount: 3,
        maxAttempts: 3,
        roomName: 'old',
        livekitDispatchId: 'd',
        livekitSipCallId: 's',
        endedAt: new Date(),
      });
      callsRepository.findByIdAndOrganization.mockResolvedValue(call);

      const result = await calls.retryNowForOrg(ORG_ID, CALL_ID);

      expect(result.status).toBe(CallStatus.PENDING);
      expect(result.maxAttempts).toBe(4);
      expect(result.roomName).toBeNull();
      expect(result.livekitDispatchId).toBeNull();
      expect(result.livekitSipCallId).toBeNull();
      expect(result.endedAt).toBeNull();
    });

    it('30. retryNow dialing rejects', async () => {
      callsRepository.findByIdAndOrganization.mockResolvedValue(
        makeCall({ status: CallStatus.DIALING }),
      );

      await expect(
        calls.retryNowForOrg(ORG_ID, CALL_ID),
      ).rejects.toThrow(/Only pending or failed/i);
    });

    it('31. prioritize pending sets priority', async () => {
      const call = makeCall({ id: CALL_ID, status: CallStatus.PENDING });
      callsRepository.findByIdAndOrganization.mockResolvedValue(call);

      const result = await calls.prioritizeForOrg(ORG_ID, CALL_ID, 50);

      expect(result.priority).toBe(50);
    });

    it('32. prioritize non-pending rejects', async () => {
      callsRepository.findByIdAndOrganization.mockResolvedValue(
        makeCall({ status: CallStatus.READY }),
      );

      await expect(
        calls.prioritizeForOrg(ORG_ID, CALL_ID),
      ).rejects.toThrow(/Only pending/i);
    });
  });

  // ─── List / get org scoping ───────────────────────────────────────────────

  describe('find / list', () => {
    it('33. findById 404 when missing', async () => {
      callsRepository.findById.mockResolvedValue(null);
      await expect(calls.findById('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('34. findByIdForOrganization uses org-scoped repo; 404 other org', async () => {
      callsRepository.findByIdAndOrganization.mockResolvedValue(null);

      await expect(
        calls.findByIdForOrganization(CALL_ID, OTHER_ORG_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(callsRepository.findByIdAndOrganization).toHaveBeenCalledWith(
        CALL_ID,
        OTHER_ORG_ID,
      );
    });

    it('35. listByOrganization maps bucket to statuses', async () => {
      callsRepository.findByOrganization.mockResolvedValue([
        makeCall({ status: CallStatus.DIALING }),
      ]);

      const rows = await calls.listByOrganization(ORG_ID, {
        bucket: CallBucket.IN_PROGRESS,
        limit: 10,
      });

      expect(callsRepository.findByOrganization).toHaveBeenCalledWith(ORG_ID, {
        limit: 10,
        statuses: [
          CallStatus.CREATING,
          CallStatus.DIALING,
          CallStatus.READY,
        ],
        batchId: undefined,
        direction: undefined,
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe(CallStatus.DIALING);
      expect(rows[0].cost).toBeNull();
    });

    it('36. listByOrganization prefers explicit status over bucket', async () => {
      callsRepository.findByOrganization.mockResolvedValue([]);

      await calls.listByOrganization(ORG_ID, {
        bucket: CallBucket.DONE,
        status: CallStatus.PENDING,
      });

      expect(callsRepository.findByOrganization).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({
          statuses: [CallStatus.PENDING],
        }),
      );
    });

    it('37. list (admin) uses findRecent', async () => {
      callsRepository.findRecent.mockResolvedValue([makeCall({ id: 'a' })]);
      const rows = await calls.list(25);
      expect(callsRepository.findRecent).toHaveBeenCalledWith(25);
      expect(rows[0].id).toBe('a');
    });
  });

  // ─── Stale reap ───────────────────────────────────────────────────────────
});
