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

describe('CallDialService', () => {
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

  describe('enqueueCallsForOrg', () => {
    it('8. creates batch + pending rows without LiveKit dial', async () => {
      const result = await dial.enqueueCallsForOrg(ORG_ID, {
        organizationAgentId: ORG_AGENT_ID,
        calls: [
          { toNumber: '+15550001111', context: { lead: 'a' } },
          { context: { phoneNumber: '5550002222' } },
        ],
        maxAttempts: 5,
        priority: 2,
      });

      expect(callBatchesService.createBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          organizationAgentId: ORG_AGENT_ID,
          sipTrunkId: TRUNK_ID,
          taskKey: 'general',
          maxAttempts: 5,
          priority: 2,
          totalCount: 2,
        }),
      );
      expect(livekit.createRoom).not.toHaveBeenCalled();
      expect(livekit.createSipParticipant).not.toHaveBeenCalled();
      expect(callsRepository.saveMany).toHaveBeenCalled();
      expect(result.count).toBe(2);
      expect(result.calls).toHaveLength(2);
      expect(result.calls[0].status).toBe(CallStatus.PENDING);
      expect(result.calls[0].medium).toBe(CallMedium.SIP);
      expect(result.calls[0].attemptCount).toBe(0);
      expect(result.calls[0].maxAttempts).toBe(5);
      // second number normalized with default country 91
      expect(result.calls[1].toNumber).toBe('+915550002222');
      expect(result.batchId).toBeTruthy();
    });

    it('9. rejects when trunk has no from numbers', async () => {
      sipTrunksService.resolveOutboundForCall.mockResolvedValue({
        ...trunk,
        numbers: [],
      });

      await expect(
        dial.enqueueCallsForOrg(ORG_ID, {
          organizationAgentId: ORG_AGENT_ID,
          calls: [{ toNumber: '+15550001111' }],
        }),
      ).rejects.toThrow(/no from numbers/i);
      expect(callBatchesService.createBatch).not.toHaveBeenCalled();
    });

    it('10. rejects missing toNumber / phoneNumber on an item', async () => {
      await expect(
        dial.enqueueCallsForOrg(ORG_ID, {
          organizationAgentId: ORG_AGENT_ID,
          calls: [{ context: { name: 'no phone' } }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── Immediate outbound ───────────────────────────────────────────────────

  describe('createOutboundCall', () => {
    it('11. dials immediately: room + dispatch + SIP; metadata packs org persona', async () => {
      const result = await dial.createOutboundCall({
        organizationId: ORG_ID,
        organizationAgentId: ORG_AGENT_ID,
        toNumber: '+1 (555) 123-4567',
        context: { bookingId: 'bk_9' },
        task: 'survey',
      });

      expect(livekit.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          emptyTimeout: 15 * 60,
        }),
      );
      expect(livekit.createAgentDispatch).toHaveBeenCalled();
      const meta = JSON.parse(
        livekit.createAgentDispatch.mock.calls[0][0].metadata,
      );
      expect(meta).toMatchObject({
        organizationId: ORG_ID,
        agentKey: 'outbound',
        direction: AgentDirection.OUTBOUND,
        medium: CallMedium.SIP,
        task: 'survey',
        prompt: {
          systemPrompt: 'Org persona',
          onEnterInstructions: 'Org enter',
          onExitInstructions: '',
        },
        enabledTools: ['endCall', 'confirmAppointment'],
        context: { bookingId: 'bk_9' },
      });
      expect(livekit.createSipParticipant).toHaveBeenCalledWith(
        expect.objectContaining({
          sipTrunkId: 'ST_out_1',
          phoneNumber: '+15551234567',
          fromNumber: '+918065179684',
          waitUntilAnswered: false,
          playDialtone: true,
          krispEnabled: true,
        }),
      );
      expect(livekit.updateSipOutboundTrunkFields).not.toHaveBeenCalled();
      expect(result.status).toBe(CallStatus.DIALING);
      expect(result.livekitSipCallId).toBe('sip-call-1');
      expect(result.toNumber).toBe('+15551234567');
    });

    it('11b. +91 dest does not auto-pin destinationCountry (Frejun allowlists US IPs)', async () => {
      await dial.createOutboundCall({
        organizationId: ORG_ID,
        organizationAgentId: ORG_AGENT_ID,
        toNumber: '+918852863728',
      });

      expect(livekit.updateSipOutboundTrunkFields).not.toHaveBeenCalled();
      expect(livekit.createSipParticipant).toHaveBeenCalled();
    });

    it('12. createOutboundCallForOrg forces organizationId from JWT arg', async () => {
      await dial.createOutboundCallForOrg(ORG_ID, {
        organizationAgentId: ORG_AGENT_ID,
        toNumber: '+15551234567',
      } as never);

      expect(
        organizationAgentsService.getEntityWithTemplate,
      ).toHaveBeenCalledWith(ORG_ID, ORG_AGENT_ID);
    });

    it('13. waitUntilAnswered true → status READY + answeredAt', async () => {
      const result = await dial.createOutboundCall({
        organizationId: ORG_ID,
        organizationAgentId: ORG_AGENT_ID,
        toNumber: '+15551234567',
        waitUntilAnswered: true,
      });

      expect(livekit.createSipParticipant).toHaveBeenCalledWith(
        expect.objectContaining({
          waitUntilAnswered: true,
          ringingTimeout: 45,
          timeout: 60,
        }),
      );
      expect(result.status).toBe(CallStatus.READY);
      expect(result.answeredAt).toBeTruthy();
    });

    it('14. SIP failure with no callee → FAILED + sip_error; deletes room', async () => {
      livekit.createSipParticipant.mockRejectedValue({
        message: 'no answer',
        sipStatusCode: 486,
      });
      livekit.hasRemoteCallee.mockResolvedValue(false);

      await expect(
        dial.createOutboundCall({
          organizationId: ORG_ID,
          organizationAgentId: ORG_AGENT_ID,
          toNumber: '+15551234567',
        }),
      ).rejects.toMatchObject({ message: 'no answer' });

      expect(livekit.deleteRoom).toHaveBeenCalled();
      const lastSave = callsRepository.save.mock.calls.at(-1)[0] as Call;
      expect(lastSave.status).toBe(CallStatus.FAILED);
      expect(lastSave.lastFailureCode).toBe(CallFailureCode.SIP_ERROR);
    });

    it('15. SIP error but callee in room → keeps READY (not terminal fail)', async () => {
      livekit.createSipParticipant.mockRejectedValue(new Error('wait timeout'));
      livekit.hasRemoteCallee.mockResolvedValue(true);

      const result = await dial.createOutboundCall({
        organizationId: ORG_ID,
        organizationAgentId: ORG_AGENT_ID,
        toNumber: '+15551234567',
        waitUntilAnswered: true,
      });

      expect(result.status).toBe(CallStatus.READY);
      expect(result.errorMessage).toMatch(/kept live/i);
      expect(livekit.deleteRoom).not.toHaveBeenCalled();
    });

    it('16. rejects missing toNumber and context.phoneNumber', async () => {
      await expect(
        dial.createOutboundCall({
          organizationId: ORG_ID,
          organizationAgentId: ORG_AGENT_ID,
        }),
      ).rejects.toThrow(/toNumber or context.phoneNumber/i);
    });
  });

  // ─── Queue dial claimed ───────────────────────────────────────────────────

  describe('dialClaimedCall', () => {
    it('17. successful dial returns dialing call and clears queue lock', async () => {
      const claimed = makeCall({
        status: CallStatus.CREATING,
        attemptCount: 1,
        queueLockedAt: new Date(),
        roomName: null,
      });

      const result = await dial.dialClaimedCall(claimed);

      expect(result.status).toBe(CallStatus.DIALING);
      expect(result.queueLockedAt).toBeNull();
      expect(livekit.createSipParticipant).toHaveBeenCalled();
    });

    it('18. missing org/agent → terminal failed without LiveKit', async () => {
      const claimed = makeCall({
        organizationId: null,
        organizationAgentId: null,
        status: CallStatus.CREATING,
      });

      const result = await dial.dialClaimedCall(claimed);

      expect(result.status).toBe(CallStatus.FAILED);
      expect(result.lastFailureCode).toBe(CallFailureCode.UNKNOWN);
      expect(livekit.createRoom).not.toHaveBeenCalled();
    });

    it('19. dial SIP error → requeue when retry policy says requeue', async () => {
      livekit.createSipParticipant.mockRejectedValue(new Error('busy'));
      livekit.hasRemoteCallee.mockResolvedValue(false);
      queueRetryService.classifyFromSipError.mockReturnValue(
        CallFailureCode.BUSY,
      );
      queueRetryService.decide.mockReturnValue({
        action: 'requeue',
        nextAttemptAt: new Date('2024-06-01T02:00:00.000Z'),
      });

      const claimed = makeCall({
        status: CallStatus.CREATING,
        attemptCount: 1,
        roomName: 'out-old',
      });

      const result = await dial.dialClaimedCall(claimed);

      expect(queueRetryService.resetForRequeue).toHaveBeenCalled();
      expect(result.status).toBe(CallStatus.PENDING);
      expect(livekit.deleteRoom).toHaveBeenCalledWith('out-old');
    });
  });

  // ─── Worker complete ──────────────────────────────────────────────────────
});
