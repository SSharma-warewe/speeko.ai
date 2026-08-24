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

describe('CallFailureService', () => {
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

  describe('reapStaleInFlight', () => {
    it('38. returns 0 when no stale rows', async () => {
      await expect(callFailure.reapStaleInFlight()).resolves.toBe(0);
    });

    it('39. reaps dialing row via failOrRequeue TIMEOUT', async () => {
      const stale = makeCall({
        id: 'stale-1',
        status: CallStatus.DIALING,
        roomName: 'out-stale',
      });
      queueClaimService.findStaleInFlight.mockResolvedValue([
        { id: 'stale-1' },
      ]);
      callsRepository.findById.mockResolvedValue(stale);
      queueRetryService.decide.mockReturnValue({
        action: 'terminal',
        nextAttemptAt: new Date(),
      });

      const n = await callFailure.reapStaleInFlight();

      expect(n).toBe(1);
      expect(queueRetryService.markTerminalFailed).toHaveBeenCalledWith(
        expect.anything(),
        CallFailureCode.TIMEOUT,
      );
      expect(livekit.deleteRoom).toHaveBeenCalledWith('out-stale');
    });

    it('40. skips row if status already left dialing/ready (race with complete)', async () => {
      queueClaimService.findStaleInFlight.mockResolvedValue([
        { id: 'stale-2' },
      ]);
      callsRepository.findById.mockResolvedValue(
        makeCall({ id: 'stale-2', status: CallStatus.COMPLETED }),
      );

      const n = await callFailure.reapStaleInFlight();

      expect(n).toBe(0);
      expect(queueRetryService.markTerminalFailed).not.toHaveBeenCalled();
    });

    it('41. stale inbound ready terminal-fails and never requeues', async () => {
      const stale = makeCall({
        id: 'stale-in',
        direction: AgentDirection.INBOUND,
        status: CallStatus.READY,
        maxAttempts: 3,
        attemptCount: 1,
        roomName: 'call-+1555_abc',
      });
      queueClaimService.findStaleInFlight.mockResolvedValue([
        { id: 'stale-in' },
      ]);
      callsRepository.findById.mockResolvedValue(stale);
      queueRetryService.decide.mockReturnValue({
        action: 'requeue',
        nextAttemptAt: new Date(),
      });

      const n = await callFailure.reapStaleInFlight();

      expect(n).toBe(1);
      expect(queueRetryService.decide).not.toHaveBeenCalled();
      expect(queueRetryService.resetForRequeue).not.toHaveBeenCalled();
      expect(queueRetryService.markTerminalFailed).toHaveBeenCalledWith(
        stale,
        CallFailureCode.TIMEOUT,
      );
      expect(livekit.deleteRoom).toHaveBeenCalledWith('call-+1555_abc');
    });
  });
});
