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

describe('CallWebTestService', () => {
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

  describe('createTestCall', () => {
    it('1. creates web test with platform agent key, packs metadata, returns Meet token', async () => {
      agentsService.findByKey.mockResolvedValue(template);

      const result = await webTest.createTestCall({
        agentKey: 'outbound',
        task: 'lead_qualification',
        context: { note: 'qa' },
      });

      expect(toolProfilesService.resolveEnabledToolIds).toHaveBeenCalledWith(
        PROFILE_ID,
      );
      expect(livekit.createRoom).toHaveBeenCalled();
      expect(livekit.createAgentDispatch).toHaveBeenCalled();

      const dispatchMeta = JSON.parse(
        livekit.createAgentDispatch.mock.calls[0][0].metadata,
      );
      expect(dispatchMeta).toMatchObject({
        agentKey: 'outbound',
        direction: AgentDirection.OUTBOUND,
        medium: CallMedium.WEB,
        task: 'lead_qualification',
        prompt: {
          systemPrompt: 'Template persona',
          onEnterInstructions: 'Template enter',
          onExitInstructions: null,
        },
        enabledTools: ['endCall', 'confirmAppointment'],
        context: { note: 'qa' },
      });
      expect(dispatchMeta.organizationId).toBeUndefined();
      expect(dispatchMeta.callId).toBeTruthy();

      expect(result.status).toBe(CallStatus.READY);
      expect(result.medium).toBe(CallMedium.WEB);
      expect(result.agentKey).toBe('outbound');
      expect(result.participantToken).toBe('tok_test');
      expect(result.meetUrl).toContain('meet.livekit.io');
      expect(result.organizationId).toBeNull();
    });

    it('2. rejects inactive platform agent', async () => {
      agentsService.findByKey.mockResolvedValue({
        ...template,
        isActive: false,
      });

      await expect(
        webTest.createTestCall({ agentKey: 'outbound' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(callsRepository.save).not.toHaveBeenCalled();
    });

    it('3. requires agentKey or agentId', async () => {
      await expect(webTest.createTestCall({} as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('4. 404 when agent key missing', async () => {
      agentsService.findByKey.mockResolvedValue(null);

      await expect(
        webTest.createTestCall({ agentKey: 'missing' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('5. marks call failed and rethrows when LiveKit room create fails', async () => {
      agentsService.findByKey.mockResolvedValue(template);
      livekit.createRoom.mockRejectedValue(new Error('room boom'));

      await expect(
        webTest.createTestCall({ agentKey: 'outbound' }),
      ).rejects.toThrow('room boom');

      const lastSave = callsRepository.save.mock.calls.at(-1)[0] as Call;
      expect(lastSave.status).toBe(CallStatus.FAILED);
      expect(lastSave.errorMessage).toBe('room boom');
    });
  });

  // ─── Org web test ─────────────────────────────────────────────────────────

  describe('createOrgAgentTestCall', () => {
    it('6. uses org persona + orgId in metadata; voice falls back to template model', async () => {
      const result = await webTest.createOrgAgentTestCall(ORG_ID, {
        organizationAgentId: ORG_AGENT_ID,
        context: { demo: true },
      });

      const dispatchMeta = JSON.parse(
        livekit.createAgentDispatch.mock.calls[0][0].metadata,
      );
      expect(dispatchMeta.organizationId).toBe(ORG_ID);
      expect(dispatchMeta.prompt.systemPrompt).toBe('Org persona');
      expect(dispatchMeta.prompt.onEnterInstructions).toBe('Org enter');
      expect(dispatchMeta.prompt.onExitInstructions).toBe('');
      expect(dispatchMeta.task).toBe('general'); // outbound: template, ignore leftover org default
      expect(dispatchMeta.voice).toBe('org-voice');
      expect(dispatchMeta.model).toBe('template-model'); // fallback
      expect(dispatchMeta.speakingRate).toBe(1.2);
      expect(dispatchMeta.deliveryMode).toBe('STABLE');
      expect(result.agentKey).toBe('outbound');
      expect(result.organizationId).toBe(ORG_ID);
      expect(result.organizationAgentId).toBe(ORG_AGENT_ID);
    });

    it('6b. inbound org test uses stored defaultTaskKey', async () => {
      const inboundTemplate = {
        ...template,
        key: 'inbound',
        direction: AgentDirection.INBOUND,
        defaultTaskKey: 'general',
      };
      organizationAgentsService.getEntityWithTemplate.mockResolvedValue({
        ...orgAgent,
        defaultTaskKey: 'confirm_appointment',
        agent: inboundTemplate,
      });

      await webTest.createOrgAgentTestCall(ORG_ID, {
        organizationAgentId: ORG_AGENT_ID,
      });

      const dispatchMeta = JSON.parse(
        livekit.createAgentDispatch.mock.calls[0][0].metadata,
      );
      expect(dispatchMeta.task).toBe('confirm_appointment');
      expect(dispatchMeta.direction).toBe(AgentDirection.INBOUND);
    });

    it('7. rejects inactive org agent', async () => {
      organizationAgentsService.getEntityWithTemplate.mockResolvedValue({
        ...orgAgent,
        isActive: false,
        agent: template,
      });

      await expect(
        webTest.createOrgAgentTestCall(ORG_ID, {
          organizationAgentId: ORG_AGENT_ID,
        }),
      ).rejects.toThrow(/inactive/i);
    });
  });

  // ─── Bulk enqueue ─────────────────────────────────────────────────────────
});
