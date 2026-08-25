import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Agent, AgentDirection } from '../../agents/agent.entity';
import { OrganizationAgent } from '../../agents/organization-agent.entity';
import { OrganizationAgentsService } from '../../agents/organization-agents.service';
import { orgAgentDefaultTaskKey } from '../../agents/org-agent-task';
import { resolveVoiceRuntime } from '../../agents/voice-settings';
import { LivekitService } from '../../livekit/livekit.service';
import { CallBatchesService } from '../../queue/call-batches.service';
import { OrganizationQueueSettingsService } from '../../queue/organization-queue-settings.service';
import { QueueRetryService } from '../../queue/queue-retry.service';
import { SipTrunksService } from '../../sip-trunks/sip-trunks.service';
import { ToolProfilesService } from '../../tools/tool-profiles.service';
import type { AgentJobMetadata } from '@call-agent/contracts';
import { CallFailureService } from './call-failure.service';
import { pickFromNumber, resolveToNumber } from '../lib/call-phone';
import { newCallRow } from '../lib/call-row';
import {
  applyCallEvent,
  CallLifecycleEvent,
  initializeCallStatus,
} from '../lib/call-state-machine';
import { resolveTaskKey } from '../lib/call-task-key';
import { Call, CallFailureCode, CallMedium, CallStatus } from '../call.entity';
import { CallsRepository } from '../calls.repository';
import { CreateOutboundCallDto } from '../dto/create-outbound-call.dto';
import { CreateUserCallsBatchDto } from '../dto/create-user-calls-batch.dto';
import { CreateUserOutboundCallDto } from '../dto/create-user-outbound-call.dto';
import {
  CallResponseDto,
  EnqueueCallsResponseDto,
} from '../dto/call-response.dto';
import { toCallResponse } from '../mappers/call-response.mapper';

@Injectable()
export class CallDialService {
  private readonly logger = new Logger(CallDialService.name);

  constructor(
    private readonly callsRepository: CallsRepository,
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
    private readonly callFailure: CallFailureService,
  ) {}

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

    const taskKey = resolveTaskKey(
      this.logger,
      dto.task,
      orgAgentDefaultTaskKey(orgAgent, template),
      template.defaultTaskKey,
    );

    const trunk = await this.sipTrunksService.resolveOutboundForCall(
      organizationId,
      dto.sipTrunkId,
    );
    const fromNumber = pickFromNumber(
      trunk.numbers,
      this.defaultCountryCode(),
    );
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
      const toNumber = resolveToNumber(
        {
          context: item.context,
          toNumber: item.toNumber,
        },
        this.defaultCountryCode(),
      );

      entities.push(
        this.callsRepository.create(
          newCallRow({
            organizationId,
            organizationAgentId: orgAgent.id,
            agentId: template.id,
            sipTrunkId: trunk.id,
            direction: AgentDirection.OUTBOUND,
            medium: CallMedium.SIP,
            livekitAgentName,
            participantIdentity: toNumber,
            fromNumber,
            toNumber,
            context: item.context ?? null,
            taskKey,
            maxAttempts,
            nextAttemptAt: now,
            batchId,
            priority,
          }),
        ),
      );
      initializeCallStatus(
        entities[entities.length - 1],
        CallLifecycleEvent.ENQUEUE,
      );
    }

    const saved = await this.callsRepository.saveMany(entities);
    this.logger.log(
      `Enqueued ${saved.length} pending calls batch=${batchId} org=${organizationId} agent=${orgAgent.id}`,
    );

    return {
      batchId,
      count: saved.length,
      calls: saved.map((call) => toCallResponse(call)),
    };
  }

  /**
   * Place an outbound SIP call. API owns room + dispatch + CreateSIPParticipant.
   * Worker is voice-only and builds runtime from metadata.
   */
  async createOutboundCall(
    dto: CreateOutboundCallDto,
  ): Promise<CallResponseDto> {
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

    const taskKey = resolveTaskKey(
      this.logger,
      dto.task,
      orgAgentDefaultTaskKey(orgAgent, template),
      template.defaultTaskKey,
    );
    const enabledTools = await this.toolProfilesService.resolveEnabledToolIds(
      orgAgent.toolProfileId ?? template.defaultToolProfileId,
    );

    const toNumber = resolveToNumber(dto, this.defaultCountryCode());
    const trunk = await this.sipTrunksService.resolveOutboundForCall(
      dto.organizationId,
      dto.sipTrunkId,
    );
    const fromNumber = pickFromNumber(
      trunk.numbers,
      this.defaultCountryCode(),
    );
    if (!fromNumber) {
      throw new BadRequestException(
        `SIP trunk has no from numbers configured: ${trunk.id}`,
      );
    }

    const shouldWait =
      dto.waitUntilAnswered !== undefined
        ? dto.waitUntilAnswered
        : this.config.get<string>('LIVEKIT_SIP_WAIT_UNTIL_ANSWERED') ===
          'true';

    const roomName = `out-${randomUUID().slice(0, 8)}`;
    const livekitAgentName = this.livekit.getAgentName();
    const participantIdentity = toNumber;

    let call = this.callsRepository.create(
      newCallRow({
        organizationId: dto.organizationId,
        organizationAgentId: orgAgent.id,
        agentId: template.id,
        sipTrunkId: trunk.id,
        direction: AgentDirection.OUTBOUND,
        medium: CallMedium.SIP,
        roomName,
        livekitAgentName,
        participantIdentity,
        fromNumber,
        toNumber,
        context: dto.context ?? null,
        taskKey,
        attemptCount: 1,
        dialStartedAt: new Date(),
      }),
    );
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
      call.errorMessage = 'Organization agent missing template';
      return this.callFailure.applyFailure({
        call,
        failureCode: CallFailureCode.UNKNOWN,
      });
    }

    const taskKey =
      call.taskKey ??
      resolveTaskKey(
        this.logger,
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
      call.fromNumber ??
      pickFromNumber(trunk.numbers, this.defaultCountryCode());
    const toNumber = call.toNumber;
    if (!fromNumber || !toNumber || !trunk.livekitTrunkId) {
      call.errorMessage = 'Missing from/to number or LiveKit trunk id';
      return this.callFailure.applyFailure({
        call,
        failureCode: CallFailureCode.SIP_ERROR,
      });
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
      return this.callFailure.applyFailure({ call, failureCode });
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

  private buildOutboundMetadata(input: {
    call: Call;
    orgAgent: OrganizationAgent;
    template: Agent;
    taskKey: string;
    enabledTools: string[];
    participantIdentity: string;
    context?: Record<string, unknown>;
  }): AgentJobMetadata {
    const {
      call,
      orgAgent,
      template,
      taskKey,
      enabledTools,
      participantIdentity,
      context,
    } = input;
    return {
      callId: call.id,
      organizationId: orgAgent.organizationId,
      organizationAgentId: orgAgent.id,
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

  private defaultCountryCode(): string {
    return this.config.get<string>('LIVEKIT_SIP_DEFAULT_COUNTRY_CODE') || '91';
  }
}

function hookModeLabel(value: string | null | undefined): string {
  if (value === '') return 'silent';
  if (typeof value === 'string' && value.trim()) return 'custom';
  return 'default';
}
