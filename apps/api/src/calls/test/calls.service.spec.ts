import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent, AgentDirection } from '../../agents/agent.entity';
import { AgentsService } from '../../agents/agents.service';
import { OrganizationAgent } from '../../agents/organization-agent.entity';
import { OrganizationAgentsService } from '../../agents/organization-agents.service';
import { LivekitService } from '../../livekit/livekit.service';
import { CallBatchesService } from '../../queue/call-batches.service';
import { OrganizationQueueSettingsService } from '../../queue/organization-queue-settings.service';
import { QueueClaimService } from '../../queue/queue-claim.service';
import { QueueRetryService } from '../../queue/queue-retry.service';
import { SipTrunk } from '../../sip-trunks/sip-trunk.entity';
import { SipTrunksService } from '../../sip-trunks/sip-trunks.service';
import { ToolProfilesService } from '../../tools/tool-profiles.service';
import {
  Call,
  CallBucket,
  CallFailureCode,
  CallMedium,
  CallStatus,
  CallTaskStatus,
} from '../call.entity';
import { CallsRepository } from '../calls.repository';
import { CallsService } from '../calls.service';

describe('CallsService', () => {
  const ORG_ID = 'org-id';
  const OTHER_ORG_ID = 'other-org-id';
  const ORG_AGENT_ID = 'org-agent-id';
  const TEMPLATE_ID = 'template-id';
  const PROFILE_ID = 'profile-id';
  const TRUNK_ID = 'trunk-id';
  const CALL_ID = 'call-id';
  const BATCH_ID = 'batch-id';

  const template: Agent = {
    id: TEMPLATE_ID,
    key: 'outbound',
    name: 'Outbound template',
    direction: AgentDirection.OUTBOUND,
    description: null,
    systemPrompt: 'Template persona',
    onEnterInstructions: 'Template enter',
    onExitInstructions: null,
    defaultTaskKey: 'general',
    defaultToolProfileId: PROFILE_ID,
    voice: 'template-voice',
    model: 'template-model',
    temperature: 0.4,
    speakingRate: 1.2,
    deliveryMode: 'STABLE',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  } as Agent;

  const orgAgent: OrganizationAgent = {
    id: ORG_AGENT_ID,
    organizationId: ORG_ID,
    agentId: TEMPLATE_ID,
    name: 'Sales dialer',
    slug: 'sales-dialer',
    systemPrompt: 'Org persona',
    onEnterInstructions: 'Org enter',
    onExitInstructions: '',
    defaultTaskKey: 'confirm_appointment',
    toolProfileId: PROFILE_ID,
    voice: 'org-voice',
    model: null,
    temperature: null,
    speakingRate: null,
    deliveryMode: null,
    calendarIntegrationId: null,
    isActive: true,
    agent: template,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  } as OrganizationAgent;

  const trunk: SipTrunk = {
    id: TRUNK_ID,
    organizationId: ORG_ID,
    name: 'Primary',
    livekitTrunkId: 'ST_out_1',
    numbers: ['+918065179684'],
    isActive: true,
  } as SipTrunk;

  const queueSettings = {
    organizationId: ORG_ID,
    defaultMaxAttempts: 3,
    retryOn: [CallFailureCode.NO_ANSWER, CallFailureCode.TIMEOUT],
  };

  let callsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    saveMany: jest.Mock;
    findById: jest.Mock;
    findByIdAndOrganization: jest.Mock;
    findRecent: jest.Mock;
    findByOrganization: jest.Mock;
  };
  let agentsService: { findById: jest.Mock; findByKey: jest.Mock };
  let organizationAgentsService: { getEntityWithTemplate: jest.Mock };
  let toolProfilesService: { resolveEnabledToolIds: jest.Mock };
  let sipTrunksService: { resolveOutboundForCall: jest.Mock };
  let livekit: {
    getAgentName: jest.Mock;
    getUrl: jest.Mock;
    createRoom: jest.Mock;
    deleteRoom: jest.Mock;
    createAgentDispatch: jest.Mock;
    createParticipantToken: jest.Mock;
    buildMeetUrl: jest.Mock;
    createSipParticipant: jest.Mock;
    hasRemoteCallee: jest.Mock;
  };
  let config: { get: jest.Mock };
  let queueSettingsService: { getOrCreate: jest.Mock };
  let callBatchesService: {
    createBatch: jest.Mock;
    maybeMarkCompleted: jest.Mock;
  };
  let queueRetryService: {
    classifyFromSipError: jest.Mock;
    classifyFromWorker: jest.Mock;
    decide: jest.Mock;
    resetForRequeue: jest.Mock;
    markTerminalFailed: jest.Mock;
  };
  let queueClaimService: {
    findStaleInFlight: jest.Mock;
    getStaleInFlightThresholds: jest.Mock;
  };

  let service: CallsService;
  let callSeq: number;

  function makeCall(overrides: Partial<Call> = {}): Call {
    callSeq += 1;
    return {
      id: overrides.id ?? `call-${callSeq}`,
      organizationId: ORG_ID,
      organizationAgentId: ORG_AGENT_ID,
      agentId: TEMPLATE_ID,
      sipTrunkId: TRUNK_ID,
      direction: AgentDirection.OUTBOUND,
      status: CallStatus.PENDING,
      medium: CallMedium.SIP,
      roomName: null,
      livekitDispatchId: null,
      livekitAgentName: 'call-agent',
      livekitSipCallId: null,
      participantIdentity: '+15551234567',
      fromNumber: '+918065179684',
      toNumber: '+15551234567',
      context: { phoneNumber: '+15551234567' },
      taskKey: 'confirm_appointment',
      taskResult: null,
      taskStatus: CallTaskStatus.PENDING,
      transcript: null,
      usage: null,
      sessionReport: null,
      errorMessage: null,
      attemptCount: 0,
      maxAttempts: 3,
      nextAttemptAt: new Date(),
      batchId: BATCH_ID,
      priority: 0,
      lastFailureCode: null,
      lastFailureAt: null,
      dialStartedAt: null,
      queueLockedAt: null,
      startedAt: null,
      answeredAt: null,
      endedAt: null,
      createdAt: new Date('2024-06-01T00:00:00.000Z'),
      updatedAt: new Date('2024-06-01T00:00:00.000Z'),
      ...overrides,
    } as Call;
  }

  function buildService(): CallsService {
    return new CallsService(
      callsRepository as unknown as CallsRepository,
      agentsService as unknown as AgentsService,
      organizationAgentsService as unknown as OrganizationAgentsService,
      toolProfilesService as unknown as ToolProfilesService,
      sipTrunksService as unknown as SipTrunksService,
      livekit as unknown as LivekitService,
      config as unknown as ConfigService,
      queueSettingsService as unknown as OrganizationQueueSettingsService,
      callBatchesService as unknown as CallBatchesService,
      queueRetryService as unknown as QueueRetryService,
      queueClaimService as unknown as QueueClaimService,
    );
  }

  beforeEach(() => {
    callSeq = 0;

    callsRepository = {
      create: jest.fn((data) => ({ ...data }) as Call),
      save: jest.fn(async (row: Call) => ({
        id: row.id ?? CALL_ID,
        createdAt: row.createdAt ?? new Date('2024-06-01T00:00:00.000Z'),
        updatedAt: new Date('2024-06-01T00:00:00.000Z'),
        ...row,
      })),
      saveMany: jest.fn(async (rows: Call[]) =>
        rows.map((row, i) => ({
          id: row.id ?? `enqueued-${i + 1}`,
          createdAt: new Date('2024-06-01T00:00:00.000Z'),
          updatedAt: new Date('2024-06-01T00:00:00.000Z'),
          ...row,
        })),
      ),
      findById: jest.fn(),
      findByIdAndOrganization: jest.fn(),
      findRecent: jest.fn(),
      findByOrganization: jest.fn(),
    };

    agentsService = {
      findById: jest.fn(),
      findByKey: jest.fn(),
    };

    organizationAgentsService = {
      getEntityWithTemplate: jest.fn().mockResolvedValue({ ...orgAgent, agent: template }),
    };

    toolProfilesService = {
      resolveEnabledToolIds: jest
        .fn()
        .mockResolvedValue(['endCall', 'confirmAppointment']),
    };

    sipTrunksService = {
      resolveOutboundForCall: jest.fn().mockResolvedValue(trunk),
    };

    livekit = {
      getAgentName: jest.fn().mockReturnValue('call-agent'),
      getUrl: jest.fn().mockReturnValue('wss://test.livekit.cloud'),
      createRoom: jest.fn().mockResolvedValue({ name: 'room' }),
      deleteRoom: jest.fn().mockResolvedValue(undefined),
      createAgentDispatch: jest.fn().mockResolvedValue({
        id: 'dispatch-1',
        room: 'room',
        agentName: 'call-agent',
      }),
      createParticipantToken: jest.fn().mockResolvedValue('tok_test'),
      buildMeetUrl: jest
        .fn()
        .mockReturnValue('https://meet.livekit.io/custom?token=tok_test'),
      createSipParticipant: jest.fn().mockResolvedValue({
        sipCallId: 'sip-call-1',
        participantIdentity: '+15551234567',
      }),
      hasRemoteCallee: jest.fn().mockResolvedValue(false),
    };

    config = {
      get: jest.fn((key: string) => {
        if (key === 'LIVEKIT_SIP_WAIT_UNTIL_ANSWERED') return 'false';
        if (key === 'LIVEKIT_SIP_DEFAULT_COUNTRY_CODE') return '91';
        return undefined;
      }),
    };

    queueSettingsService = {
      getOrCreate: jest.fn().mockResolvedValue(queueSettings),
    };

    callBatchesService = {
      createBatch: jest.fn().mockResolvedValue({ id: BATCH_ID }),
      maybeMarkCompleted: jest.fn().mockResolvedValue(undefined),
    };

    queueRetryService = {
      classifyFromSipError: jest
        .fn()
        .mockReturnValue(CallFailureCode.SIP_ERROR),
      classifyFromWorker: jest
        .fn()
        .mockReturnValue(CallFailureCode.AGENT_ERROR),
      decide: jest.fn().mockReturnValue({
        action: 'terminal',
        nextAttemptAt: new Date(),
      }),
      resetForRequeue: jest.fn((call: Call) => {
        call.status = CallStatus.PENDING;
        call.nextAttemptAt = new Date('2024-06-01T01:00:00.000Z');
        call.queueLockedAt = null;
        call.roomName = null;
      }),
      markTerminalFailed: jest.fn((call: Call, code: CallFailureCode) => {
        call.status = CallStatus.FAILED;
        call.lastFailureCode = code;
        call.lastFailureAt = new Date();
        call.endedAt = new Date();
        call.queueLockedAt = null;
      }),
    };

    queueClaimService = {
      findStaleInFlight: jest.fn().mockResolvedValue([]),
      getStaleInFlightThresholds: jest.fn().mockReturnValue({
        dialingSeconds: 180,
        readySeconds: 900,
      }),
    };

    service = buildService();
  });

  // ─── Admin web test ───────────────────────────────────────────────────────

  describe('createTestCall', () => {
    it('1. creates web test with platform agent key, packs metadata, returns Meet token', async () => {
      agentsService.findByKey.mockResolvedValue(template);

      const result = await service.createTestCall({
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
        service.createTestCall({ agentKey: 'outbound' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(callsRepository.save).not.toHaveBeenCalled();
    });

    it('3. requires agentKey or agentId', async () => {
      await expect(service.createTestCall({} as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('4. 404 when agent key missing', async () => {
      agentsService.findByKey.mockResolvedValue(null);

      await expect(
        service.createTestCall({ agentKey: 'missing' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('5. marks call failed and rethrows when LiveKit room create fails', async () => {
      agentsService.findByKey.mockResolvedValue(template);
      livekit.createRoom.mockRejectedValue(new Error('room boom'));

      await expect(
        service.createTestCall({ agentKey: 'outbound' }),
      ).rejects.toThrow('room boom');

      const lastSave = callsRepository.save.mock.calls.at(-1)[0] as Call;
      expect(lastSave.status).toBe(CallStatus.FAILED);
      expect(lastSave.errorMessage).toBe('room boom');
    });
  });

  // ─── Org web test ─────────────────────────────────────────────────────────

  describe('createOrgAgentTestCall', () => {
    it('6. uses org persona + orgId in metadata; voice falls back to template model', async () => {
      const result = await service.createOrgAgentTestCall(ORG_ID, {
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

      await service.createOrgAgentTestCall(ORG_ID, {
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
        service.createOrgAgentTestCall(ORG_ID, {
          organizationAgentId: ORG_AGENT_ID,
        }),
      ).rejects.toThrow(/inactive/i);
    });
  });

  // ─── Bulk enqueue ─────────────────────────────────────────────────────────

  describe('enqueueCallsForOrg', () => {
    it('8. creates batch + pending rows without LiveKit dial', async () => {
      const result = await service.enqueueCallsForOrg(ORG_ID, {
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
        service.enqueueCallsForOrg(ORG_ID, {
          organizationAgentId: ORG_AGENT_ID,
          calls: [{ toNumber: '+15550001111' }],
        }),
      ).rejects.toThrow(/no from numbers/i);
      expect(callBatchesService.createBatch).not.toHaveBeenCalled();
    });

    it('10. rejects missing toNumber / phoneNumber on an item', async () => {
      await expect(
        service.enqueueCallsForOrg(ORG_ID, {
          organizationAgentId: ORG_AGENT_ID,
          calls: [{ context: { name: 'no phone' } }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── Immediate outbound ───────────────────────────────────────────────────

  describe('createOutboundCall', () => {
    it('11. dials immediately: room + dispatch + SIP; metadata packs org persona', async () => {
      const result = await service.createOutboundCall({
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
      expect(result.status).toBe(CallStatus.DIALING);
      expect(result.livekitSipCallId).toBe('sip-call-1');
      expect(result.toNumber).toBe('+15551234567');
    });

    it('12. createOutboundCallForOrg forces organizationId from JWT arg', async () => {
      await service.createOutboundCallForOrg(ORG_ID, {
        organizationAgentId: ORG_AGENT_ID,
        toNumber: '+15551234567',
      } as never);

      expect(
        organizationAgentsService.getEntityWithTemplate,
      ).toHaveBeenCalledWith(ORG_ID, ORG_AGENT_ID);
    });

    it('13. waitUntilAnswered true → status READY + answeredAt', async () => {
      const result = await service.createOutboundCall({
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
        service.createOutboundCall({
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

      const result = await service.createOutboundCall({
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
        service.createOutboundCall({
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

      const result = await service.dialClaimedCall(claimed);

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

      const result = await service.dialClaimedCall(claimed);

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

      const result = await service.dialClaimedCall(claimed);

      expect(queueRetryService.resetForRequeue).toHaveBeenCalled();
      expect(result.status).toBe(CallStatus.PENDING);
      expect(livekit.deleteRoom).toHaveBeenCalledWith('out-old');
    });
  });

  // ─── Worker complete ──────────────────────────────────────────────────────

  describe('completeFromWorker', () => {
    it('20. completed happy path persists transcript and marks batch', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.DIALING,
        batchId: BATCH_ID,
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await service.completeFromWorker(CALL_ID, {
        status: 'completed',
        taskCompleted: true,
        transcript: [{ role: 'assistant', content: 'Hello' }],
        usage: { models: [{ name: 'llm' }] },
        taskResult: { outcome: 'ok' },
        toolEvents: [{ toolId: 'endCall', ok: true }],
        answeredAt: '2024-06-01T10:00:00.000Z',
        endedAt: '2024-06-01T10:05:00.000Z',
      });

      expect(result.status).toBe(CallStatus.COMPLETED);
      expect(result.taskStatus).toBe(CallTaskStatus.COMPLETED);
      expect(result.transcript).toEqual([
        { role: 'assistant', content: 'Hello' },
      ]);
      expect(result.taskResult).toEqual({ outcome: 'ok' });
      expect(result.sessionReport?.toolEvents).toEqual([
        { toolId: 'endCall', ok: true },
      ]);
      expect(result.toolEvents).toEqual([{ toolId: 'endCall', ok: true }]);
      expect(callBatchesService.maybeMarkCompleted).toHaveBeenCalledWith(
        BATCH_ID,
      );
    });

    it('21. worker failed + requeue decision resets to pending', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.READY,
        maxAttempts: 3,
        attemptCount: 1,
        roomName: 'out-x',
        organizationId: ORG_ID,
      });
      callsRepository.findById.mockResolvedValue(call);
      queueRetryService.classifyFromWorker.mockReturnValue(
        CallFailureCode.TIMEOUT,
      );
      queueRetryService.decide.mockReturnValue({
        action: 'requeue',
        nextAttemptAt: new Date('2024-06-01T03:00:00.000Z'),
      });

      const result = await service.completeFromWorker(CALL_ID, {
        status: 'failed',
        errorMessage: 'timeout',
        failureCode: 'timeout',
      });

      expect(queueRetryService.resetForRequeue).toHaveBeenCalled();
      expect(livekit.deleteRoom).toHaveBeenCalledWith('out-x');
      expect(result.status).toBe(CallStatus.PENDING);
      expect(callBatchesService.maybeMarkCompleted).not.toHaveBeenCalled();
    });

    it('22. worker failed terminal when maxAttempts=1 (skip requeue branch)', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.DIALING,
        maxAttempts: 1,
        attemptCount: 1,
        batchId: BATCH_ID,
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await service.completeFromWorker(CALL_ID, {
        status: 'failed',
        errorMessage: 'agent crash',
      });

      expect(queueRetryService.markTerminalFailed).toHaveBeenCalled();
      expect(result.status).toBe(CallStatus.FAILED);
      expect(callBatchesService.maybeMarkCompleted).toHaveBeenCalledWith(
        BATCH_ID,
      );
    });

    it('23. idempotent complete on already-completed only fills missing fields', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.COMPLETED,
        transcript: null,
        usage: { models: [] },
        sessionReport: { already: true },
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await service.completeFromWorker(CALL_ID, {
        status: 'completed',
        transcript: [{ role: 'user', content: 'late' }],
        usage: { models: [{ name: 'ignored' }] },
        sessionReport: { ignored: true },
        toolEvents: [{ toolId: 'endCall', ok: true }],
      });

      expect(result.status).toBe(CallStatus.COMPLETED);
      expect(result.transcript).toEqual([{ role: 'user', content: 'late' }]);
      // existing usage kept
      expect(result.usage).toEqual({ models: [] });
      // toolEvents merged into existing sessionReport
      expect(result.sessionReport).toMatchObject({
        already: true,
        toolEvents: [{ toolId: 'endCall', ok: true }],
      });
    });

    it('24. session ended without taskCompleted → incomplete, no invented answeredAt', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.DIALING,
        startedAt: new Date('2024-06-01T10:00:00.000Z'),
        answeredAt: null,
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await service.completeFromWorker(CALL_ID, {
        status: 'completed',
        endedAt: '2024-06-01T10:01:00.000Z',
      });

      expect(result.status).toBe(CallStatus.INCOMPLETE);
      expect(result.taskStatus).toBe(CallTaskStatus.INCOMPLETE);
      expect(result.answeredAt).toBeNull();
    });

    it('24e. omitted taskCompleted but complete_* tool ok → completed', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.READY,
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await service.completeFromWorker(CALL_ID, {
        status: 'completed',
        toolEvents: [{ toolId: 'complete_demo_booking_task', ok: true }],
        taskResult: { outcome: 'CALLBACK' },
      });

      expect(result.status).toBe(CallStatus.COMPLETED);
      expect(result.taskStatus).toBe(CallTaskStatus.COMPLETED);
    });

    it('24c. taskCompleted false → incomplete even with taskResult leftover', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.READY,
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await service.completeFromWorker(CALL_ID, {
        status: 'completed',
        taskCompleted: false,
        taskResult: { outcome: 'NO_ANSWER' },
      });

      expect(result.status).toBe(CallStatus.INCOMPLETE);
      expect(result.taskStatus).toBe(CallTaskStatus.INCOMPLETE);
    });

    it('24d. late complete on incomplete stays incomplete', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.INCOMPLETE,
        taskStatus: CallTaskStatus.INCOMPLETE,
        transcript: null,
      });
      callsRepository.findById.mockResolvedValue(call);

      const result = await service.completeFromWorker(CALL_ID, {
        status: 'completed',
        taskCompleted: true,
        transcript: [{ role: 'user', content: 'late' }],
      });

      expect(result.status).toBe(CallStatus.INCOMPLETE);
      expect(result.taskStatus).toBe(CallTaskStatus.INCOMPLETE);
      expect(result.transcript).toEqual([{ role: 'user', content: 'late' }]);
    });

    it('24b. 404 when call missing', async () => {
      callsRepository.findById.mockResolvedValue(null);

      await expect(
        service.completeFromWorker('missing', { status: 'completed' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── Org controls ─────────────────────────────────────────────────────────

  describe('cancel / retry / prioritize', () => {
    it('25. cancel pending succeeds and marks batch', async () => {
      const call = makeCall({
        id: CALL_ID,
        status: CallStatus.PENDING,
        batchId: BATCH_ID,
      });
      callsRepository.findByIdAndOrganization.mockResolvedValue(call);

      const result = await service.cancelPendingForOrg(ORG_ID, CALL_ID);

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
        service.cancelPendingForOrg(ORG_ID, CALL_ID),
      ).rejects.toThrow(/Only pending/i);
    });

    it('27. cancel wrong org → 404 (findByIdAndOrganization null)', async () => {
      callsRepository.findByIdAndOrganization.mockResolvedValue(null);

      await expect(
        service.cancelPendingForOrg(OTHER_ORG_ID, CALL_ID),
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

      const result = await service.retryNowForOrg(ORG_ID, CALL_ID);

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

      const result = await service.retryNowForOrg(ORG_ID, CALL_ID);

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
        service.retryNowForOrg(ORG_ID, CALL_ID),
      ).rejects.toThrow(/Only pending or failed/i);
    });

    it('31. prioritize pending sets priority', async () => {
      const call = makeCall({ id: CALL_ID, status: CallStatus.PENDING });
      callsRepository.findByIdAndOrganization.mockResolvedValue(call);

      const result = await service.prioritizeForOrg(ORG_ID, CALL_ID, 50);

      expect(result.priority).toBe(50);
    });

    it('32. prioritize non-pending rejects', async () => {
      callsRepository.findByIdAndOrganization.mockResolvedValue(
        makeCall({ status: CallStatus.READY }),
      );

      await expect(
        service.prioritizeForOrg(ORG_ID, CALL_ID),
      ).rejects.toThrow(/Only pending/i);
    });
  });

  // ─── List / get org scoping ───────────────────────────────────────────────

  describe('find / list', () => {
    it('33. findById 404 when missing', async () => {
      callsRepository.findById.mockResolvedValue(null);
      await expect(service.findById('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('34. findByIdForOrganization uses org-scoped repo; 404 other org', async () => {
      callsRepository.findByIdAndOrganization.mockResolvedValue(null);

      await expect(
        service.findByIdForOrganization(CALL_ID, OTHER_ORG_ID),
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

      const rows = await service.listByOrganization(ORG_ID, {
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
    });

    it('36. listByOrganization prefers explicit status over bucket', async () => {
      callsRepository.findByOrganization.mockResolvedValue([]);

      await service.listByOrganization(ORG_ID, {
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
      const rows = await service.list(25);
      expect(callsRepository.findRecent).toHaveBeenCalledWith(25);
      expect(rows[0].id).toBe('a');
    });
  });

  // ─── Stale reap ───────────────────────────────────────────────────────────

  describe('reapStaleInFlight', () => {
    it('38. returns 0 when no stale rows', async () => {
      await expect(service.reapStaleInFlight()).resolves.toBe(0);
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

      const n = await service.reapStaleInFlight();

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

      const n = await service.reapStaleInFlight();

      expect(n).toBe(0);
      expect(queueRetryService.markTerminalFailed).not.toHaveBeenCalled();
    });
  });
});
