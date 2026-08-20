import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Agent, AgentDirection } from '../agents/agent.entity';
import { OrganizationAgent } from '../agents/organization-agent.entity';
import { AgentsService } from '../agents/agents.service';
import { OrganizationAgentsService } from '../agents/organization-agents.service';
import { orgAgentDefaultTaskKey } from '../agents/org-agent-task';
import { resolveVoiceRuntime } from '../agents/voice-settings';
import { LivekitService } from '../livekit/livekit.service';
import { CallBatchesService } from '../queue/call-batches.service';
import { OrganizationQueueSettingsService } from '../queue/organization-queue-settings.service';
import { QueueClaimService } from '../queue/queue-claim.service';
import { QueueRetryService } from '../queue/queue-retry.service';
import { SipTrunksService } from '../sip-trunks/sip-trunks.service';
import {
  DEFAULT_TASK_KEY,
  isKnownTaskKey,
} from '../tools/known-tools';
import { ToolProfilesService } from '../tools/tool-profiles.service';
import {
  applyCallEvent,
  CallLifecycleEvent,
  initializeCallStatus,
  isTerminalCallStatus,
} from './call-state-machine';
import { workerReportedTaskCompleted } from './worker-task-completed';
import {
  CALL_BUCKET_STATUSES,
  Call,
  CallBucket,
  CallFailureCode,
  CallMedium,
  CallStatus,
  CallTaskStatus,
  CallTranscriptItem,
  CallUsageSnapshot,
} from './call.entity';
import { CallsRepository } from './calls.repository';
import { CompleteCallDto } from './dto/complete-call.dto';
import { CreateOutboundCallDto } from './dto/create-outbound-call.dto';
import { CreateTestCallDto } from './dto/create-test-call.dto';
import { CreateUserCallsBatchDto } from './dto/create-user-calls-batch.dto';
import { CreateUserOutboundCallDto } from './dto/create-user-outbound-call.dto';
import { CreateUserTestCallDto } from './dto/create-user-test-call.dto';
import {
  CallResponseDto,
  EnqueueCallsResponseDto,
  TestCallResponseDto,
} from './dto/call-response.dto';
import { toCallResponse, toTestCallResponse } from './mappers/call-response.mapper';

/**
 * Runtime-only payload the worker reads from job metadata.
 * Persona prompt + tool IDs + task key + context. No executable code.
 */
export type AgentJobMetadata = {
  callId: string;
  organizationId?: string;
  agentKey: string;
  direction: string;
  medium?: string;
  /** LiveKit task key resolved by the worker TaskRegistry. */
  task: string;
  prompt: {
    systemPrompt: string;
    /** null = worker default; empty string = skip speech. */
    onEnterInstructions?: string | null;
    /** null = worker default; empty string = skip speech. */
    onExitInstructions?: string | null;
  };
  /** Worker ToolRegistry ids enabled for this call. */
  enabledTools: string[];
  context?: Record<string, unknown>;
  participantIdentity?: string;
  voice?: string | null;
  model?: string | null;
  temperature?: number | null;
  speakingRate?: number | null;
  deliveryMode?: string | null;
};

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly callsRepository: CallsRepository,
    private readonly agentsService: AgentsService,
    private readonly organizationAgentsService: OrganizationAgentsService,
    private readonly toolProfilesService: ToolProfilesService,
    private readonly sipTrunksService: SipTrunksService,
    private readonly livekit: LivekitService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => OrganizationQueueSettingsService))
    private readonly queueSettingsService: OrganizationQueueSettingsService,
    @Inject(forwardRef(() => CallBatchesService))
    private readonly callBatchesService: CallBatchesService,
    @Inject(forwardRef(() => QueueRetryService))
    private readonly queueRetryService: QueueRetryService,
    @Inject(forwardRef(() => QueueClaimService))
    private readonly queueClaimService: QueueClaimService,
  ) {}

  async createTestCall(dto: CreateTestCallDto): Promise<TestCallResponseDto> {
    const agent = await this.resolvePlatformAgent(dto);
    if (!agent.isActive) {
      throw new BadRequestException(`Agent is inactive: ${agent.key}`);
    }

    const taskKey = this.resolveTaskKey(dto.task, agent.defaultTaskKey);
    const enabledTools = await this.toolProfilesService.resolveEnabledToolIds(
      agent.defaultToolProfileId,
    );

    const roomName = `test-${agent.key}-${randomUUID().slice(0, 8)}`;
    const participantIdentity = `tester-${randomUUID().slice(0, 8)}`;
    const livekitAgentName = this.livekit.getAgentName();

    let call = this.callsRepository.create({
      organizationId: null,
      organizationAgentId: null,
      agentId: agent.id,
      sipTrunkId: null,
      direction: agent.direction,
      status: CallStatus.CREATING,
      taskStatus: CallTaskStatus.PENDING,
      medium: CallMedium.WEB,
      roomName,
      livekitDispatchId: null,
      livekitAgentName,
      livekitSipCallId: null,
      attemptCount: 1,
      maxAttempts: 1,
      nextAttemptAt: null,
      batchId: null,
      priority: 0,
      lastFailureCode: null,
      lastFailureAt: null,
      dialStartedAt: new Date(),
      queueLockedAt: null,
      participantIdentity,
      fromNumber: null,
      toNumber: null,
      context: dto.context ?? null,
      taskKey,
      taskResult: null,
      transcript: null,
      usage: null,
      sessionReport: null,
      errorMessage: null,
      startedAt: null,
      answeredAt: null,
      endedAt: null,
    });
    initializeCallStatus(call, CallLifecycleEvent.START_IMMEDIATE);
    call = await this.callsRepository.save(call);

    try {
      const metadata: AgentJobMetadata = {
        callId: call.id,
        agentKey: agent.key,
        direction: agent.direction,
        medium: CallMedium.WEB,
        task: taskKey,
        prompt: {
          systemPrompt: agent.systemPrompt,
          onEnterInstructions: agent.onEnterInstructions ?? null,
          onExitInstructions: agent.onExitInstructions ?? null,
        },
        enabledTools,
        context: dto.context,
        participantIdentity,
        ...resolveVoiceRuntime(agent),
      };

      await this.livekit.createRoom({
        name: roomName,
        emptyTimeout: 10 * 60,
        metadata: JSON.stringify({
          callId: call.id,
          agentKey: agent.key,
          task: taskKey,
        }),
      });

      const dispatch = await this.livekit.createAgentDispatch({
        roomName,
        metadata: JSON.stringify(metadata),
      });

      const participantToken = await this.livekit.createParticipantToken({
        identity: participantIdentity,
        name: 'Test caller',
        roomName,
        ttl: '1h',
      });

      call.livekitDispatchId = dispatch.id;
      applyCallEvent(call, CallLifecycleEvent.DISPATCH, CallStatus.READY);
      call.startedAt = new Date();
      call = await this.callsRepository.save(call);

      this.logger.log(
        `Test call ready id=${call.id} room=${roomName} agentKey=${agent.key} task=${taskKey}`,
      );

      return toTestCallResponse(call, {
        agentKey: agent.key,
        livekitUrl: this.livekit.getUrl(),
        participantToken,
        meetUrl: this.livekit.buildMeetUrl(participantToken),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      applyCallEvent(call, CallLifecycleEvent.DIAL_FAILED, CallStatus.FAILED);
      call.errorMessage = message;
      await this.callsRepository.save(call);
      this.logger.error(`Test call failed id=${call.id}: ${message}`);
      throw err;
    }
  }

  /**
   * Org-user outbound: force organizationId from JWT (never trust client body).
   */
  createOutboundCallForOrg(
    organizationId: string,
    dto: CreateUserOutboundCallDto,
  ): Promise<CallResponseDto> {
    return this.createOutboundCall({
      ...dto,
      organizationId,
    });
  }

  /**
   * Bulk enqueue pending SIP calls (no LiveKit dial). API queue dialer claims later.
   * Org id from JWT only.
   */
  async enqueueCallsForOrg(
    organizationId: string,
    dto: CreateUserCallsBatchDto,
  ): Promise<EnqueueCallsResponseDto> {
    const orgAgent =
      await this.organizationAgentsService.getEntityWithTemplate(
        organizationId,
        dto.organizationAgentId,
      );

    if (!orgAgent.isActive) {
      throw new BadRequestException(
        `Organization agent is inactive: ${dto.organizationAgentId}`,
      );
    }

    const template = orgAgent.agent;
    if (!template) {
      throw new BadRequestException(
        `Organization agent missing template relation: ${orgAgent.id}`,
      );
    }

    const taskKey = this.resolveTaskKey(
      dto.task,
      orgAgentDefaultTaskKey(orgAgent, template),
      template.defaultTaskKey,
    );

    const trunk = await this.sipTrunksService.resolveOutboundForCall(
      organizationId,
      dto.sipTrunkId,
    );
    const fromNumber = this.pickFromNumber(trunk.numbers);
    if (!fromNumber) {
      throw new BadRequestException(
        `SIP trunk has no from numbers configured: ${trunk.id}`,
      );
    }

    const queueSettings =
      await this.queueSettingsService.getOrCreate(organizationId);
    const maxAttempts =
      dto.maxAttempts ?? queueSettings.defaultMaxAttempts ?? 3;
    const priority = dto.priority ?? 0;
    const batchId = randomUUID();
    const livekitAgentName = this.livekit.getAgentName();
    const now = new Date();

    await this.callBatchesService.createBatch({
      id: batchId,
      organizationId,
      organizationAgentId: orgAgent.id,
      sipTrunkId: trunk.id,
      taskKey,
      maxAttempts,
      maxConcurrent: dto.maxConcurrent ?? null,
      priority,
      totalCount: dto.calls.length,
    });

    const entities: Call[] = [];
    for (let i = 0; i < dto.calls.length; i++) {
      const item = dto.calls[i];
      const toNumber = this.resolveToNumber({
        organizationId,
        organizationAgentId: dto.organizationAgentId,
        context: item.context,
        toNumber: item.toNumber,
      });

      entities.push(
        this.callsRepository.create({
          organizationId,
          organizationAgentId: orgAgent.id,
          agentId: template.id,
          sipTrunkId: trunk.id,
          direction: AgentDirection.OUTBOUND,
          status: CallStatus.PENDING,
          taskStatus: CallTaskStatus.PENDING,
          medium: CallMedium.SIP,
          roomName: null,
          livekitDispatchId: null,
          livekitAgentName,
          livekitSipCallId: null,
          participantIdentity: toNumber,
          fromNumber,
          toNumber,
          context: item.context ?? null,
          taskKey,
          taskResult: null,
          transcript: null,
          usage: null,
          sessionReport: null,
          errorMessage: null,
          attemptCount: 0,
          maxAttempts,
          nextAttemptAt: now,
          batchId,
          priority,
          lastFailureCode: null,
          lastFailureAt: null,
          dialStartedAt: null,
          queueLockedAt: null,
          startedAt: null,
          answeredAt: null,
          endedAt: null,
        }),
      );
      initializeCallStatus(entities[entities.length - 1], CallLifecycleEvent.ENQUEUE);
    }

    const saved = await this.callsRepository.saveMany(entities);
    this.logger.log(
      `Enqueued ${saved.length} pending calls batch=${batchId} org=${organizationId} agent=${orgAgent.id}`,
    );

    return {
      batchId,
      count: saved.length,
      calls: saved.map(toCallResponse),
    };
  }

  /**
   * Org-user web test against an assigned organization agent (effective config).
   * API creates room + dispatch + Meet token; worker is voice-only.
   */
  async createOrgAgentTestCall(
    organizationId: string,
    dto: CreateUserTestCallDto,
  ): Promise<TestCallResponseDto> {
    const orgAgent =
      await this.organizationAgentsService.getEntityWithTemplate(
        organizationId,
        dto.organizationAgentId,
      );

    if (!orgAgent.isActive) {
      throw new BadRequestException(
        `Organization agent is inactive: ${dto.organizationAgentId}`,
      );
    }

    const template = orgAgent.agent;
    if (!template) {
      throw new BadRequestException(
        `Organization agent missing template relation: ${orgAgent.id}`,
      );
    }

    const taskKey = this.resolveTaskKey(
      dto.task,
      orgAgentDefaultTaskKey(orgAgent, template),
      template.defaultTaskKey,
    );
    const enabledTools = await this.toolProfilesService.resolveEnabledToolIds(
      orgAgent.toolProfileId ?? template.defaultToolProfileId,
    );

    const roomName = `test-org-${template.key}-${randomUUID().slice(0, 8)}`;
    const participantIdentity = `tester-${randomUUID().slice(0, 8)}`;
    const livekitAgentName = this.livekit.getAgentName();

    let call = this.callsRepository.create({
      organizationId,
      organizationAgentId: orgAgent.id,
      agentId: template.id,
      sipTrunkId: null,
      direction: template.direction,
      status: CallStatus.CREATING,
      taskStatus: CallTaskStatus.PENDING,
      medium: CallMedium.WEB,
      roomName,
      livekitDispatchId: null,
      livekitAgentName,
      livekitSipCallId: null,
      participantIdentity,
      fromNumber: null,
      toNumber: null,
      context: dto.context ?? null,
      taskKey,
      taskResult: null,
      transcript: null,
      usage: null,
      sessionReport: null,
      errorMessage: null,
      attemptCount: 1,
      maxAttempts: 1,
      nextAttemptAt: null,
      batchId: null,
      priority: 0,
      lastFailureCode: null,
      lastFailureAt: null,
      dialStartedAt: new Date(),
      queueLockedAt: null,
      startedAt: null,
      answeredAt: null,
      endedAt: null,
    });
    initializeCallStatus(call, CallLifecycleEvent.START_IMMEDIATE);
    call = await this.callsRepository.save(call);

    try {
      const metadata: AgentJobMetadata = {
        callId: call.id,
        organizationId,
        agentKey: template.key,
        direction: template.direction,
        medium: CallMedium.WEB,
        task: taskKey,
        prompt: {
          systemPrompt: orgAgent.systemPrompt,
          onEnterInstructions: orgAgent.onEnterInstructions ?? null,
          onExitInstructions: orgAgent.onExitInstructions ?? null,
        },
        enabledTools,
        context: dto.context,
        participantIdentity,
        ...resolveVoiceRuntime(orgAgent, template),
      };

      await this.livekit.createRoom({
        name: roomName,
        emptyTimeout: 10 * 60,
        metadata: JSON.stringify({
          callId: call.id,
          organizationId,
          agentKey: template.key,
          task: taskKey,
        }),
      });

      const dispatch = await this.livekit.createAgentDispatch({
        roomName,
        metadata: JSON.stringify(metadata),
      });

      const participantToken = await this.livekit.createParticipantToken({
        identity: participantIdentity,
        name: 'Test caller',
        roomName,
        ttl: '1h',
      });

      call.livekitDispatchId = dispatch.id;
      applyCallEvent(call, CallLifecycleEvent.DISPATCH, CallStatus.READY);
      call.startedAt = new Date();
      call = await this.callsRepository.save(call);

      this.logger.log(
        `Org test call ready id=${call.id} org=${organizationId} ` +
          `room=${roomName} agentKey=${template.key} task=${taskKey}`,
      );

      return toTestCallResponse(call, {
        agentKey: template.key,
        livekitUrl: this.livekit.getUrl(),
        participantToken,
        meetUrl: this.livekit.buildMeetUrl(participantToken),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      applyCallEvent(call, CallLifecycleEvent.DIAL_FAILED, CallStatus.FAILED);
      call.errorMessage = message;
      await this.callsRepository.save(call);
      this.logger.error(`Org test call failed id=${call.id}: ${message}`);
      throw err;
    }
  }

  /**
   * Place an outbound SIP call. API owns room + dispatch + CreateSIPParticipant.
   * Worker is voice-only and builds runtime from metadata.
   */
  async createOutboundCall(dto: CreateOutboundCallDto): Promise<CallResponseDto> {
    const orgAgent =
      await this.organizationAgentsService.getEntityWithTemplate(
        dto.organizationId,
        dto.organizationAgentId,
      );

    if (!orgAgent.isActive) {
      throw new BadRequestException(
        `Organization agent is inactive: ${dto.organizationAgentId}`,
      );
    }

    const template = orgAgent.agent;
    if (!template) {
      throw new BadRequestException(
        `Organization agent missing template relation: ${orgAgent.id}`,
      );
    }

    const taskKey = this.resolveTaskKey(
      dto.task,
      orgAgentDefaultTaskKey(orgAgent, template),
      template.defaultTaskKey,
    );
    const enabledTools = await this.toolProfilesService.resolveEnabledToolIds(
      orgAgent.toolProfileId ?? template.defaultToolProfileId,
    );

    const toNumber = this.resolveToNumber(dto);
    const trunk = await this.sipTrunksService.resolveOutboundForCall(
      dto.organizationId,
      dto.sipTrunkId,
    );
    const fromNumber = this.pickFromNumber(trunk.numbers);
    if (!fromNumber) {
      throw new BadRequestException(
        `SIP trunk has no from numbers configured: ${trunk.id}`,
      );
    }

    const shouldWait =
      dto.waitUntilAnswered !== undefined
        ? dto.waitUntilAnswered
        : this.config.get<string>('LIVEKIT_SIP_WAIT_UNTIL_ANSWERED') === 'true';

    const roomName = `out-${randomUUID().slice(0, 8)}`;
    const livekitAgentName = this.livekit.getAgentName();
    const participantIdentity = toNumber;

    let call = this.callsRepository.create({
      organizationId: dto.organizationId,
      organizationAgentId: orgAgent.id,
      agentId: template.id,
      sipTrunkId: trunk.id,
      direction: AgentDirection.OUTBOUND,
      status: CallStatus.CREATING,
      taskStatus: CallTaskStatus.PENDING,
      medium: CallMedium.SIP,
      roomName,
      livekitDispatchId: null,
      livekitAgentName,
      livekitSipCallId: null,
      participantIdentity,
      fromNumber,
      toNumber,
      context: dto.context ?? null,
      taskKey,
      taskResult: null,
      transcript: null,
      usage: null,
      sessionReport: null,
      errorMessage: null,
      attemptCount: 1,
      maxAttempts: 1,
      nextAttemptAt: null,
      batchId: null,
      priority: 0,
      lastFailureCode: null,
      lastFailureAt: null,
      dialStartedAt: new Date(),
      queueLockedAt: null,
      startedAt: null,
      answeredAt: null,
      endedAt: null,
    });
    initializeCallStatus(call, CallLifecycleEvent.START_IMMEDIATE);
    call = await this.callsRepository.save(call);

    try {
      call = await this.executeSipDial({
        call,
        orgAgent,
        template,
        taskKey,
        enabledTools,
        trunkLivekitId: trunk.livekitTrunkId!,
        fromNumber,
        toNumber,
        participantIdentity,
        context: dto.context,
        shouldWait,
        roomName,
      });
      return toCallResponse(call);
    } catch (err) {
      const message = this.formatSipError(err);
      applyCallEvent(call, CallLifecycleEvent.DIAL_FAILED, CallStatus.FAILED);
      call.errorMessage = message;
      call.lastFailureCode = CallFailureCode.SIP_ERROR;
      call.lastFailureAt = new Date();
      call.endedAt = new Date();
      await this.callsRepository.save(call);
      this.logger.error(`Outbound call failed id=${call.id}: ${message}`);
      throw err;
    }
  }

  /**
   * Dial a queue-claimed call (status already creating, attempt_count incremented).
   * On failure applies retry policy instead of always terminal failed.
   */
  async dialClaimedCall(call: Call): Promise<Call> {
    if (!call.organizationId || !call.organizationAgentId) {
      applyCallEvent(call, CallLifecycleEvent.DIAL_FAILED, CallStatus.FAILED);
      call.errorMessage = 'Queued call missing organization or agent';
      call.lastFailureCode = CallFailureCode.UNKNOWN;
      call.lastFailureAt = new Date();
      call.endedAt = new Date();
      call.queueLockedAt = null;
      return this.callsRepository.save(call);
    }

    const orgAgent =
      await this.organizationAgentsService.getEntityWithTemplate(
        call.organizationId,
        call.organizationAgentId,
      );
    const template = orgAgent.agent;
    if (!template) {
      return this.failOrRequeueClaimed(
        call,
        CallFailureCode.UNKNOWN,
        'Organization agent missing template',
      );
    }

    const taskKey = call.taskKey ?? this.resolveTaskKey(
      null,
      orgAgentDefaultTaskKey(orgAgent, template),
      template.defaultTaskKey,
    );
    const enabledTools = await this.toolProfilesService.resolveEnabledToolIds(
      orgAgent.toolProfileId ?? template.defaultToolProfileId,
    );

    const trunk = await this.sipTrunksService.resolveOutboundForCall(
      call.organizationId,
      call.sipTrunkId ?? undefined,
    );
    const fromNumber =
      call.fromNumber ?? this.pickFromNumber(trunk.numbers);
    const toNumber = call.toNumber;
    if (!fromNumber || !toNumber || !trunk.livekitTrunkId) {
      return this.failOrRequeueClaimed(
        call,
        CallFailureCode.SIP_ERROR,
        'Missing from/to number or LiveKit trunk id',
      );
    }

    const shouldWait =
      this.config.get<string>('LIVEKIT_SIP_WAIT_UNTIL_ANSWERED') === 'true';
    const roomName = call.roomName ?? `out-${randomUUID().slice(0, 8)}`;
    call.roomName = roomName;
    call.fromNumber = fromNumber;
    call.participantIdentity = call.participantIdentity ?? toNumber;
    call.livekitAgentName =
      call.livekitAgentName ?? this.livekit.getAgentName();
    call = await this.callsRepository.save(call);

    try {
      return await this.executeSipDial({
        call,
        orgAgent,
        template,
        taskKey,
        enabledTools,
        trunkLivekitId: trunk.livekitTrunkId,
        fromNumber,
        toNumber,
        participantIdentity: call.participantIdentity!,
        context: call.context ?? undefined,
        shouldWait,
        roomName,
      });
    } catch (err) {
      const message = this.formatSipError(err);
      const sipCode = this.extractSipStatusCode(err);
      const failureCode = this.queueRetryService.classifyFromSipError(
        message,
        sipCode,
      );
      call.errorMessage = message;
      return this.failOrRequeueClaimed(call, failureCode, message);
    }
  }

  private async executeSipDial(input: {
    call: Call;
    orgAgent: OrganizationAgent;
    template: Agent;
    taskKey: string;
    enabledTools: string[];
    trunkLivekitId: string;
    fromNumber: string;
    toNumber: string;
    participantIdentity: string;
    context?: Record<string, unknown>;
    shouldWait: boolean;
    roomName: string;
  }): Promise<Call> {
    let { call } = input;
    const {
      orgAgent,
      template,
      taskKey,
      enabledTools,
      trunkLivekitId,
      fromNumber,
      toNumber,
      participantIdentity,
      context,
      shouldWait,
      roomName,
    } = input;

    const metadata = this.buildOutboundMetadata({
      call,
      orgAgent,
      template,
      taskKey,
      enabledTools,
      participantIdentity,
      context,
    });

    this.logger.log(
      `Dial metadata callId=${call.id} orgAgent=${orgAgent.id} task=${taskKey} ` +
        `tools=${enabledTools.join(',') || 'none'} ` +
        `onEnter=${hookModeLabel(orgAgent.onEnterInstructions)} ` +
        `onExit=${hookModeLabel(orgAgent.onExitInstructions)} ` +
        `calendarLink=${orgAgent.calendarIntegrationId ? 'yes' : 'no'}`,
    );

    await this.livekit.createRoom({
      name: roomName,
      emptyTimeout: 15 * 60,
      metadata: JSON.stringify({
        callId: call.id,
        organizationId: call.organizationId,
        direction: 'outbound',
        task: taskKey,
      }),
    });

    const dispatch = await this.livekit.createAgentDispatch({
      roomName,
      metadata: JSON.stringify(metadata),
    });
    call.livekitDispatchId = dispatch.id;
    applyCallEvent(call, CallLifecycleEvent.DISPATCH, CallStatus.DIALING);
    call.startedAt = call.startedAt ?? new Date();
    call.queueLockedAt = null;
    call = await this.callsRepository.save(call);

    this.logger.log(
      `Dialing SIP trunk=${trunkLivekitId} from=${fromNumber} to=${toNumber} wait=${shouldWait} task=${taskKey} call=${call.id}`,
    );

    try {
      const sipParticipant = await this.livekit.createSipParticipant({
        sipTrunkId: trunkLivekitId,
        phoneNumber: toNumber,
        roomName,
        fromNumber,
        participantIdentity,
        waitUntilAnswered: shouldWait,
        playDialtone: true,
        krispEnabled: true,
        ringingTimeout: shouldWait ? 45 : undefined,
        timeout: shouldWait ? 60 : undefined,
      });

      call.livekitSipCallId = sipParticipant.sipCallId || null;
      call.participantIdentity =
        sipParticipant.participantIdentity || participantIdentity;

      if (shouldWait) {
        applyCallEvent(call, CallLifecycleEvent.ANSWERED, CallStatus.READY);
        call.answeredAt = new Date();
      }
      call = await this.callsRepository.save(call);

      this.logger.log(
        `Outbound call id=${call.id} room=${roomName} to=${toNumber} ` +
          `trunk=${trunkLivekitId} wait=${shouldWait} status=${call.status} task=${taskKey}`,
      );
      return call;
    } catch (err) {
      const message = this.formatSipError(err);

      // CreateSIPParticipant(waitUntilAnswered=true) can error even after callee joined.
      const calleeInRoom = await this.livekit.hasRemoteCallee(roomName, {
        expectedIdentity: participantIdentity,
      });
      if (calleeInRoom) {
        this.logger.warn(
          `SIP create reported error but callee is still in room; keeping call live ` +
            `id=${call.id} room=${roomName}: ${message}`,
        );
        applyCallEvent(call, CallLifecycleEvent.ANSWERED, CallStatus.READY);
        call.answeredAt = call.answeredAt ?? new Date();
        call.errorMessage = `SIP wait reported: ${message} (call kept live)`;
        call.queueLockedAt = null;
        return this.callsRepository.save(call);
      }

      await this.livekit.deleteRoom(roomName);
      throw err;
    }
  }

  /**
   * Fail/requeue dialing|ready rows that never received worker complete.
   * Called once per queue dialer tick (global, all orgs). Frees max_concurrent
   * slots held by zombie sessions after worker hang/death.
   */
  async reapStaleInFlight(): Promise<number> {
    const stale = await this.queueClaimService.findStaleInFlight();
    if (stale.length === 0) {
      return 0;
    }

    const thresholds = this.queueClaimService.getStaleInFlightThresholds();
    let reaped = 0;

    for (const row of stale) {
      try {
        // Re-load so we don't race a late worker complete.
        const call = await this.callsRepository.findById(row.id);
        if (!call) {
          continue;
        }
        if (
          call.status !== CallStatus.DIALING &&
          call.status !== CallStatus.READY
        ) {
          continue;
        }

        const thresholdSecs =
          call.status === CallStatus.READY
            ? thresholds.readySeconds
            : thresholds.dialingSeconds;
        const message =
          `Stale in-flight reclaimed (status=${call.status} after ${thresholdSecs}s without complete)`;

        await this.failOrRequeueClaimed(
          call,
          CallFailureCode.TIMEOUT,
          message,
        );
        reaped += 1;
      } catch (err) {
        this.logger.error(
          `Stale in-flight reap failed id=${row.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    if (reaped > 0) {
      this.logger.warn(
        `Reaped ${reaped} stale in-flight call(s) (dialing>${thresholds.dialingSeconds}s ready>${thresholds.readySeconds}s)`,
      );
    }
    return reaped;
  }

  private async failOrRequeueClaimed(
    call: Call,
    failureCode: CallFailureCode,
    message: string,
  ): Promise<Call> {
    call.errorMessage = message;
    if (!call.organizationId) {
      this.queueRetryService.markTerminalFailed(call, failureCode);
      if (call.roomName) {
        await this.livekit.deleteRoom(call.roomName).catch(() => undefined);
      }
      return this.callsRepository.save(call);
    }

    const settings = await this.queueSettingsService.getOrCreate(
      call.organizationId,
    );
    const decision = this.queueRetryService.decide({
      call,
      settings,
      failureCode,
    });

    if (decision.action === 'requeue') {
      if (call.roomName) {
        await this.livekit.deleteRoom(call.roomName).catch(() => undefined);
      }
      this.queueRetryService.resetForRequeue(call, decision);
      this.logger.warn(
        `Requeued call id=${call.id} code=${failureCode} next=${decision.nextAttemptAt.toISOString()}`,
      );
    } else {
      this.queueRetryService.markTerminalFailed(call, failureCode);
      if (call.roomName) {
        await this.livekit.deleteRoom(call.roomName).catch(() => undefined);
      }
      this.logger.error(
        `Queued dial failed terminal id=${call.id} code=${failureCode}: ${message}`,
      );
      if (call.batchId) {
        await this.callBatchesService.maybeMarkCompleted(call.batchId);
      }
    }
    return this.callsRepository.save(call);
  }

  private buildOutboundMetadata(input: {
    call: Call;
    orgAgent: OrganizationAgent;
    template: Agent;
    taskKey: string;
    enabledTools: string[];
    participantIdentity: string;
    context?: Record<string, unknown>;
  }): AgentJobMetadata {
    const { call, orgAgent, template, taskKey, enabledTools, participantIdentity, context } =
      input;
    return {
      callId: call.id,
      organizationId: orgAgent.organizationId,
      agentKey: template.key,
      direction: AgentDirection.OUTBOUND,
      medium: CallMedium.SIP,
      task: taskKey,
      prompt: {
        systemPrompt: orgAgent.systemPrompt,
        onEnterInstructions: orgAgent.onEnterInstructions ?? null,
        onExitInstructions: orgAgent.onExitInstructions ?? null,
      },
      enabledTools,
      context,
      participantIdentity,
      ...resolveVoiceRuntime(orgAgent, template),
    };
  }

  private resolveTaskKey(
    requested?: string | null,
    ...fallbacks: Array<string | null | undefined>
  ): string {
    const candidates = [requested, ...fallbacks, DEFAULT_TASK_KEY];
    for (const raw of candidates) {
      if (typeof raw === 'string' && raw.trim()) {
        const key = raw.trim();
        if (!isKnownTaskKey(key)) {
          // Allow forward-compatible custom keys registered only in the worker.
          this.logger.warn(`Unknown task key (passing through): ${key}`);
        }
        return key;
      }
    }
    return DEFAULT_TASK_KEY;
  }

  private formatSipError(err: unknown): string {
    if (!err || typeof err !== 'object') {
      return String(err);
    }
    const e = err as {
      message?: string;
      sipStatusCode?: number | string;
      sipStatus?: string;
      code?: string;
    };
    const parts = [
      e.message,
      e.sipStatusCode != null ? `sip=${e.sipStatusCode}` : null,
      e.sipStatus ? String(e.sipStatus) : null,
      e.code ? `code=${e.code}` : null,
    ].filter(Boolean);
    return parts.join(' | ') || String(err);
  }

  private extractSipStatusCode(err: unknown): number | string | undefined {
    if (!err || typeof err !== 'object') return undefined;
    const e = err as { sipStatusCode?: number | string };
    return e.sipStatusCode;
  }

  async completeFromWorker(
    id: string,
    dto: CompleteCallDto,
  ): Promise<CallResponseDto> {
    const call = await this.callsRepository.findById(id);
    if (!call) {
      throw new NotFoundException(`Call not found: ${id}`);
    }

    if (isTerminalCallStatus(call.status)) {
      if (dto.transcript && !call.transcript) {
        call.transcript = dto.transcript as CallTranscriptItem[];
      }
      if (dto.usage && !call.usage) {
        call.usage = dto.usage as CallUsageSnapshot;
      }
      if (dto.sessionReport && !call.sessionReport) {
        call.sessionReport = dto.sessionReport;
      }
      if (dto.taskResult && !call.taskResult) {
        call.taskResult = dto.taskResult;
      }
      this.mergeToolEventsIntoSessionReport(call, dto.toolEvents);
      if (dto.answeredAt && !call.answeredAt) {
        call.answeredAt = this.parseDate(dto.answeredAt);
      }
      if (dto.endedAt && !call.endedAt) {
        call.endedAt = this.parseDate(dto.endedAt);
      }
      const saved = await this.callsRepository.save(call);
      return toCallResponse(saved);
    }

    if (dto.transcript) {
      call.transcript = dto.transcript as CallTranscriptItem[];
    }
    if (dto.usage) {
      call.usage = dto.usage as CallUsageSnapshot;
    }
    if (dto.sessionReport) {
      call.sessionReport = dto.sessionReport;
    }
    if (dto.taskResult) {
      call.taskResult = dto.taskResult;
    }
    this.mergeToolEventsIntoSessionReport(call, dto.toolEvents);
    if (dto.answeredAt) {
      call.answeredAt = this.parseDate(dto.answeredAt);
    }
    if (dto.errorMessage) {
      call.errorMessage = dto.errorMessage;
    }

    if (dto.status === 'completed') {
      const taskDone = workerReportedTaskCompleted(dto);
      applyCallEvent(
        call,
        taskDone
          ? CallLifecycleEvent.TASK_COMPLETE
          : CallLifecycleEvent.SESSION_ENDED_NO_TASK,
        taskDone ? CallStatus.COMPLETED : CallStatus.INCOMPLETE,
        { mode: 'lenient', logger: this.logger },
      );
      call.endedAt = dto.endedAt ? this.parseDate(dto.endedAt) : new Date();
      call.queueLockedAt = null;
      call.nextAttemptAt = null;
      const saved = await this.callsRepository.save(call);
      if (saved.batchId) {
        await this.callBatchesService.maybeMarkCompleted(saved.batchId);
      }
      this.logger.log(
        `Call complete id=${saved.id} status=${saved.status} ` +
          `task=${saved.taskKey ?? 'n/a'} taskStatus=${saved.taskStatus} ` +
          `transcriptItems=${saved.transcript?.length ?? 0} ` +
          `tools=${this.formatToolEventsSummary(saved.sessionReport)}`,
      );
      return toCallResponse(saved);
    }

    // Failed from worker — may requeue under org policy
    const failureCode = this.queueRetryService.classifyFromWorker({
      failureCode: dto.failureCode,
      errorMessage: dto.errorMessage,
    });
    call.endedAt = dto.endedAt ? this.parseDate(dto.endedAt) : new Date();

    if (call.organizationId && call.maxAttempts > 1) {
      const settings = await this.queueSettingsService.getOrCreate(
        call.organizationId,
      );
      const decision = this.queueRetryService.decide({
        call,
        settings,
        failureCode,
      });
      if (decision.action === 'requeue') {
        if (call.roomName) {
          await this.livekit.deleteRoom(call.roomName).catch(() => undefined);
        }
        // Keep transcript/usage from this attempt on the row for inspection
        this.queueRetryService.resetForRequeue(call, decision);
        const saved = await this.callsRepository.save(call);
        this.logger.warn(
          `Worker failed; requeued call id=${saved.id} code=${failureCode} ` +
            `attempt=${saved.attemptCount}/${saved.maxAttempts}`,
        );
        return toCallResponse(saved);
      }
    }

    this.queueRetryService.markTerminalFailed(call, failureCode);
    const saved = await this.callsRepository.save(call);
    if (saved.batchId) {
      await this.callBatchesService.maybeMarkCompleted(saved.batchId);
    }
    this.logger.log(
      `Call complete id=${saved.id} status=${saved.status} ` +
        `task=${saved.taskKey ?? 'n/a'} transcriptItems=${saved.transcript?.length ?? 0} ` +
        `tools=${this.formatToolEventsSummary(saved.sessionReport)}`,
    );
    return toCallResponse(saved);
  }

  /** Merge worker toolEvents into sessionReport.toolEvents (JSONB, no schema change). */
  private mergeToolEventsIntoSessionReport(
    call: Call,
    toolEvents?: Array<Record<string, unknown>> | null,
  ): void {
    if (!toolEvents?.length) return;
    const base =
      call.sessionReport && typeof call.sessionReport === 'object'
        ? { ...call.sessionReport }
        : {};
    call.sessionReport = {
      ...base,
      toolEvents,
    };
  }

  private formatToolEventsSummary(
    sessionReport: Record<string, unknown> | null | undefined,
  ): string {
    const events = sessionReport?.toolEvents;
    if (!Array.isArray(events) || events.length === 0) return 'none';
    return events
      .map((raw) => {
        const e = raw as { toolId?: string; ok?: boolean };
        const id = e.toolId ?? 'tool';
        const status = e.ok === false ? 'fail' : e.ok === true ? 'ok' : '?';
        return `${id}:${status}`;
      })
      .join(',');
  }

  async cancelPendingForOrg(
    organizationId: string,
    callId: string,
  ): Promise<CallResponseDto> {
    const call = await this.callsRepository.findByIdAndOrganization(
      callId,
      organizationId,
    );
    if (!call) {
      throw new NotFoundException(`Call not found: ${callId}`);
    }
    if (call.status !== CallStatus.PENDING) {
      throw new BadRequestException(
        `Only pending calls can be cancelled (status=${call.status})`,
      );
    }
    applyCallEvent(call, CallLifecycleEvent.CANCEL, CallStatus.CANCELLED);
    call.endedAt = new Date();
    call.nextAttemptAt = null;
    call.queueLockedAt = null;
    call.lastFailureCode = CallFailureCode.CANCELLED;
    call.lastFailureAt = new Date();
    call.errorMessage = call.errorMessage ?? 'Cancelled by user';
    const saved = await this.callsRepository.save(call);
    if (saved.batchId) {
      await this.callBatchesService.maybeMarkCompleted(saved.batchId);
    }
    return toCallResponse(saved);
  }

  async retryNowForOrg(
    organizationId: string,
    callId: string,
  ): Promise<CallResponseDto> {
    const call = await this.callsRepository.findByIdAndOrganization(
      callId,
      organizationId,
    );
    if (!call) {
      throw new NotFoundException(`Call not found: ${callId}`);
    }

    if (call.status === CallStatus.PENDING) {
      call.nextAttemptAt = new Date();
      call.priority = Math.max(call.priority, 10);
      const saved = await this.callsRepository.save(call);
      return toCallResponse(saved);
    }

    if (call.status === CallStatus.FAILED) {
      if (call.attemptCount >= call.maxAttempts) {
        // Allow one more cycle: bump max by keeping status pending if user force-retries
        call.maxAttempts = call.attemptCount + 1;
      }
      applyCallEvent(call, CallLifecycleEvent.RETRY_NOW, CallStatus.PENDING);
      call.nextAttemptAt = new Date();
      call.endedAt = null;
      call.queueLockedAt = null;
      call.roomName = null;
      call.livekitDispatchId = null;
      call.livekitSipCallId = null;
      call.priority = Math.max(call.priority, 10);
      const saved = await this.callsRepository.save(call);
      return toCallResponse(saved);
    }

    throw new BadRequestException(
      `Only pending or failed calls can be retried (status=${call.status})`,
    );
  }

  async prioritizeForOrg(
    organizationId: string,
    callId: string,
    priority = 100,
  ): Promise<CallResponseDto> {
    const call = await this.callsRepository.findByIdAndOrganization(
      callId,
      organizationId,
    );
    if (!call) {
      throw new NotFoundException(`Call not found: ${callId}`);
    }
    if (call.status !== CallStatus.PENDING) {
      throw new BadRequestException(
        `Only pending calls can be prioritized (status=${call.status})`,
      );
    }
    call.priority = priority;
    const saved = await this.callsRepository.save(call);
    return toCallResponse(saved);
  }

  async findById(id: string): Promise<CallResponseDto> {
    const call = await this.callsRepository.findById(id);
    if (!call) {
      throw new NotFoundException(`Call not found: ${id}`);
    }
    return toCallResponse(call);
  }

  async findByIdForOrganization(
    id: string,
    organizationId: string,
  ): Promise<CallResponseDto> {
    const call = await this.callsRepository.findByIdAndOrganization(
      id,
      organizationId,
    );
    if (!call) {
      throw new NotFoundException(`Call not found: ${id}`);
    }
    return toCallResponse(call);
  }

  async list(limit = 50): Promise<CallResponseDto[]> {
    const rows = await this.callsRepository.findRecent(limit);
    return rows.map(toCallResponse);
  }

  async listByOrganization(
    organizationId: string,
    options: {
      limit?: number;
      bucket?: CallBucket;
      status?: CallStatus;
      batchId?: string;
      direction?: AgentDirection;
    } = {},
  ): Promise<CallResponseDto[]> {
    const limit = options.limit ?? 50;
    let statuses: CallStatus[] | undefined;
    if (options.status) {
      statuses = [options.status];
    } else if (options.bucket) {
      statuses = CALL_BUCKET_STATUSES[options.bucket];
    }

    const rows = await this.callsRepository.findByOrganization(organizationId, {
      limit,
      statuses,
      batchId: options.batchId,
      direction: options.direction,
    });
    return rows.map(toCallResponse);
  }

  private async resolvePlatformAgent(dto: CreateTestCallDto): Promise<Agent> {
    if (!dto.agentKey && !dto.agentId) {
      throw new BadRequestException('Provide agentKey or agentId');
    }
    if (dto.agentId) {
      return this.agentsService.findById(dto.agentId);
    }
    const agent = await this.agentsService.findByKey(dto.agentKey!);
    if (!agent) {
      throw new NotFoundException(`Agent not found for key: ${dto.agentKey}`);
    }
    return agent;
  }

  private resolveToNumber(dto: CreateOutboundCallDto): string {
    const raw =
      dto.toNumber?.trim() ||
      (typeof dto.context?.phoneNumber === 'string'
        ? dto.context.phoneNumber.trim()
        : '') ||
      (typeof dto.context?.toNumber === 'string'
        ? dto.context.toNumber.trim()
        : '');

    if (!raw) {
      throw new BadRequestException(
        'Provide toNumber or context.phoneNumber for outbound dial',
      );
    }
    return this.normalizePhone(raw);
  }

  private normalizePhone(raw: string): string {
    const cleaned = raw.replace(/[\s()-]/g, '');
    if (cleaned.startsWith('+')) {
      return cleaned;
    }
    const country =
      this.config.get<string>('LIVEKIT_SIP_DEFAULT_COUNTRY_CODE') || '91';
    const digits = cleaned.replace(/^\+/, '').replace(/^0+/, '');
    return `+${country}${digits}`;
  }

  private pickFromNumber(numbers: string[] | null | undefined): string | null {
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return null;
    }
    const first = numbers.find((n) => typeof n === 'string' && n.trim());
    if (!first) {
      return null;
    }
    return this.normalizePhone(first.trim());
  }

  private parseDate(value: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      return new Date();
    }
    return d;
  }
}

function hookModeLabel(value: string | null | undefined): string {
  if (value === '') return 'silent';
  if (typeof value === 'string' && value.trim()) return 'custom';
  return 'default';
}
