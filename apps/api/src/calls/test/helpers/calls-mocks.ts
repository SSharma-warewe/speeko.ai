import { ConfigService } from '@nestjs/config';
import { Agent, AgentDirection } from '../../../agents/agent.entity';
import { AgentsService } from '../../../agents/agents.service';
import { OrganizationAgent } from '../../../agents/organization-agent.entity';
import { OrganizationAgentsService } from '../../../agents/organization-agents.service';
import { LivekitService } from '../../../livekit/livekit.service';
import { CallBatchesService } from '../../../queue/call-batches.service';
import { OrganizationQueueSettingsService } from '../../../queue/organization-queue-settings.service';
import { QueueClaimService } from '../../../queue/queue-claim.service';
import { QueueRetryService } from '../../../queue/queue-retry.service';
import { PriceService } from '../../../price/price.service';
import { SipTrunk } from '../../../sip-trunks/sip-trunk.entity';
import { SipTrunksService } from '../../../sip-trunks/sip-trunks.service';
import { ToolProfilesService } from '../../../tools/tool-profiles.service';
import { CallDialService } from '../../services/call-dial.service';
import { CallFailureService } from '../../services/call-failure.service';
import { CallWebTestService } from '../../services/call-web-test.service';
import { CallWorkerService } from '../../services/call-worker.service';
import {
  Call,
  CallFailureCode,
  CallMedium,
  CallStatus,
  CallTaskStatus,
} from '../../call.entity';
import { CallsRepository } from '../../calls.repository';
import { CallsService } from '../../services/calls.service';

export const ORG_ID = 'org-id';
export const OTHER_ORG_ID = 'other-org-id';
export const ORG_AGENT_ID = 'org-agent-id';
export const TEMPLATE_ID = 'template-id';
export const PROFILE_ID = 'profile-id';
export const TRUNK_ID = 'trunk-id';
export const CALL_ID = 'call-id';
export const BATCH_ID = 'batch-id';

export const template = {
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

export const orgAgent = {
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

export const trunk = {
  id: TRUNK_ID,
  organizationId: ORG_ID,
  name: 'Primary',
  livekitTrunkId: 'ST_out_1',
  numbers: ['+918065179684'],
  isActive: true,
} as SipTrunk;

export const queueSettings = {
  organizationId: ORG_ID,
  defaultMaxAttempts: 3,
  retryOn: [CallFailureCode.NO_ANSWER, CallFailureCode.TIMEOUT],
};

export function createCallsHarness() {
  let callSeq = 0;

  const callsRepository = {
    create: jest.fn((data) => ({ ...data }) as Call),
    save: jest.fn(async (row: Call) => ({
      ...row,
      id: row.id ?? CALL_ID,
      createdAt: row.createdAt ?? new Date('2024-06-01T00:00:00.000Z'),
      updatedAt: new Date('2024-06-01T00:00:00.000Z'),
    })),
    saveMany: jest.fn(async (rows: Call[]) =>
      rows.map((row, i) => ({
        ...row,
        id: row.id ?? `enqueued-${i + 1}`,
        createdAt: row.createdAt ?? new Date('2024-06-01T00:00:00.000Z'),
        updatedAt: new Date('2024-06-01T00:00:00.000Z'),
      })),
    ),
    findById: jest.fn(),
    findByIdAndOrganization: jest.fn(),
    findByRoomName: jest.fn(),
    findRecent: jest.fn(),
    findByOrganization: jest.fn(),
  };

  const agentsService = {
    findById: jest.fn(),
    findByKey: jest.fn(),
  };

  const organizationAgentsService = {
    getEntityWithTemplate: jest
      .fn()
      .mockResolvedValue({ ...orgAgent, agent: template }),
  };

  const toolProfilesService = {
    resolveEnabledToolIds: jest
      .fn()
      .mockResolvedValue(['endCall', 'confirmAppointment']),
  };

  const sipTrunksService = {
    resolveOutboundForCall: jest.fn().mockResolvedValue(trunk),
    findByLivekitTrunkId: jest.fn().mockResolvedValue(null),
  };

  const priceService = {
    applyAttemptToCall: jest.fn(async (call: Call) => {
      const nextAttempt = (call.cost?.attempts?.length ?? 0) + 1;
      const totalUsd = 0.01 * nextAttempt;
      call.cost = {
        currency: 'USD',
        markup: 0,
        plan: 'ship',
        catalogAsOf: '2026-08-21',
        totalUsd,
        billedMinutes: nextAttempt,
        unknownModels: [],
        lines: [],
        attempts: [
          ...(call.cost?.attempts ?? []),
          {
            attempt: nextAttempt,
            billedMinutes: 1,
            totalUsd: 0.01,
            lines: [],
            unknownModels: [],
          },
        ],
      };
      call.costUsd = totalUsd;
      return call.cost;
    }),
    fillCostIfMissing: jest.fn(async (call: Call) => {
      if (call.cost) return call.cost;
      call.cost = {
        currency: 'USD',
        markup: 0,
        plan: 'ship',
        catalogAsOf: '2026-08-21',
        totalUsd: 0.01,
        billedMinutes: 1,
        unknownModels: [],
        lines: [],
        attempts: [
          {
            attempt: 1,
            billedMinutes: 1,
            totalUsd: 0.01,
            lines: [],
            unknownModels: [],
          },
        ],
      };
      call.costUsd = 0.01;
      return call.cost;
    }),
  };

  const livekit = {
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

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'LIVEKIT_SIP_WAIT_UNTIL_ANSWERED') return 'false';
      if (key === 'LIVEKIT_SIP_DEFAULT_COUNTRY_CODE') return '91';
      return undefined;
    }),
  };

  const queueSettingsService = {
    getOrCreate: jest.fn().mockResolvedValue(queueSettings),
  };

  const callBatchesService = {
    createBatch: jest.fn().mockResolvedValue({ id: BATCH_ID }),
    maybeMarkCompleted: jest.fn().mockResolvedValue(undefined),
  };

  const queueRetryService = {
    classifyFromSipError: jest.fn().mockReturnValue(CallFailureCode.SIP_ERROR),
    classifyFromWorker: jest.fn().mockReturnValue(CallFailureCode.AGENT_ERROR),
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

  const queueClaimService = {
    findStaleInFlight: jest.fn().mockResolvedValue([]),
    getStaleInFlightThresholds: jest.fn().mockReturnValue({
      dialingSeconds: 180,
      readySeconds: 900,
    }),
  };

  const callFailure = new CallFailureService(
    callsRepository as unknown as CallsRepository,
    priceService as unknown as PriceService,
    livekit as unknown as LivekitService,
    queueSettingsService as unknown as OrganizationQueueSettingsService,
    callBatchesService as unknown as CallBatchesService,
    queueRetryService as unknown as QueueRetryService,
    queueClaimService as unknown as QueueClaimService,
  );

  const webTest = new CallWebTestService(
    callsRepository as unknown as CallsRepository,
    agentsService as unknown as AgentsService,
    organizationAgentsService as unknown as OrganizationAgentsService,
    toolProfilesService as unknown as ToolProfilesService,
    livekit as unknown as LivekitService,
  );

  const dial = new CallDialService(
    callsRepository as unknown as CallsRepository,
    organizationAgentsService as unknown as OrganizationAgentsService,
    toolProfilesService as unknown as ToolProfilesService,
    sipTrunksService as unknown as SipTrunksService,
    livekit as unknown as LivekitService,
    config as unknown as ConfigService,
    queueSettingsService as unknown as OrganizationQueueSettingsService,
    callBatchesService as unknown as CallBatchesService,
    queueRetryService as unknown as QueueRetryService,
    callFailure,
  );

  const worker = new CallWorkerService(
    callsRepository as unknown as CallsRepository,
    agentsService as unknown as AgentsService,
    organizationAgentsService as unknown as OrganizationAgentsService,
    sipTrunksService as unknown as SipTrunksService,
    livekit as unknown as LivekitService,
    priceService as unknown as PriceService,
    callBatchesService as unknown as CallBatchesService,
    queueRetryService as unknown as QueueRetryService,
    callFailure,
  );

  const calls = new CallsService(
    callsRepository as unknown as CallsRepository,
    callBatchesService as unknown as CallBatchesService,
  );

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
      cost: null,
      costUsd: null,
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

  return {
    callsRepository,
    agentsService,
    organizationAgentsService,
    toolProfilesService,
    sipTrunksService,
    priceService,
    livekit,
    config,
    queueSettingsService,
    callBatchesService,
    queueRetryService,
    queueClaimService,
    callFailure,
    webTest,
    dial,
    worker,
    calls,
    makeCall,
  };
}
