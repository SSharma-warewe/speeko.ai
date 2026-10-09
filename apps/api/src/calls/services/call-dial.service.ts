import { VoiceTasksService } from '../../voice-tasks/voice-tasks.service';
import {
  requiresOpeningPreparation,
  OPENING_PREPARATION_TIMEOUT_MS,
  type OpeningPreparation,
} from '@call-agent/contracts';
import { OpeningPreparationError } from '../lib/opening-preparation-error';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AgentDirection } from '../../agents/agent.entity';
import { OrganizationAgent } from '../../agents/organization-agent.entity';
import { OrganizationAgentsService } from '../../agents/organization-agents.service';
import { packOrgAgentJobMetadata } from '../../agents/job-metadata';
import { LivekitService } from '../../livekit/livekit.service';
import { CallBatchesService } from '../../queue/call-batches.service';
import { OrganizationQueueSettingsService } from '../../queue/organization-queue-settings.service';
import { QueueRetryService } from '../../queue/queue-retry.service';
import { QueueAdmissionService } from '../../queue/queue-admission.service';
import { SipTrunk } from '../../sip-trunks/sip-trunk.entity';
import { SipTrunksService } from '../../sip-trunks/sip-trunks.service';
import { ToolProfilesService } from '../../tools/tool-profiles.service';
import { CallFailureService } from './call-failure.service';
import { pickFromNumber, resolveToNumber } from '../lib/call-phone';
import { newCallRow } from '../lib/call-row';
import {
  applyCallEvent,
  CallLifecycleEvent,
  initializeCallStatus,
} from '../lib/call-state-machine';
import { requireActiveOrgAgent } from '../lib/require-org-agent';
import { resolveOrgAgentTaskKey } from '../lib/call-task-key';
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
    @Inject(forwardRef(() => QueueAdmissionService))
    private readonly queueAdmission: QueueAdmissionService,
    private readonly voiceTasks?: VoiceTasksService,
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
    const { orgAgent, template } = await requireActiveOrgAgent(
      this.organizationAgentsService,
      organizationId,
      dto.organizationAgentId,
    );
    const taskKey = resolveOrgAgentTaskKey(
      this.logger,
      dto.task,
      orgAgent,
      template,
    );
    const voiceTaskSnapshot =
      (await this.voiceTasks?.resolve(
        organizationId,
        dto,
        orgAgent,
        template,
      )) ?? null;
    const configuredContexts = voiceTaskSnapshot
      ? await Promise.all(
          dto.calls.map(
            async (item) =>
              (
                await this.organizationAgentsService.prepareVoiceTask(
                  orgAgent,
                  voiceTaskSnapshot,
                  await this.toolProfilesService.resolveEnabledToolIds(
                    orgAgent.toolProfileId ?? template.defaultToolProfileId,
                    organizationId,
                  ),
                  item.context,
                )
              ).context,
          ),
        )
      : dto.calls.map((item) => item.context);
    const { trunk, fromNumber } = await this.resolveOutboundFrom(
      organizationId,
      dto.sipTrunkId,
    );

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
      taskKey: voiceTaskSnapshot
        ? `custom_${voiceTaskSnapshot.taskId}`
        : taskKey,
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
            context: configuredContexts[i] ?? null,
            voiceTaskSnapshot,
            taskKey: voiceTaskSnapshot
              ? `custom_${voiceTaskSnapshot.taskId}`
              : taskKey,
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
    const { orgAgent, template } = await requireActiveOrgAgent(
      this.organizationAgentsService,
      dto.organizationId,
      dto.organizationAgentId,
    );
    const taskKey = resolveOrgAgentTaskKey(
      this.logger,
      dto.task,
      orgAgent,
      template,
    );
    const enabledTools = await this.toolProfilesService.resolveEnabledToolIds(
      orgAgent.toolProfileId ?? template.defaultToolProfileId,
      dto.organizationId,
    );

    const voiceTaskSnapshot =
      (await this.voiceTasks?.resolve(
        dto.organizationId,
        dto,
        orgAgent,
        template,
      )) ?? null;
    const prepared = voiceTaskSnapshot
      ? await this.organizationAgentsService.prepareVoiceTask(
          orgAgent,
          voiceTaskSnapshot,
          enabledTools,
          dto.context,
        )
      : { context: dto.context, enabledTools };
    const toNumber = resolveToNumber(dto, this.defaultCountryCode());
    const { trunk, fromNumber } = await this.resolveOutboundFrom(
      dto.organizationId,
      dto.sipTrunkId,
    );

    const shouldWait =
      dto.waitUntilAnswered !== undefined
        ? dto.waitUntilAnswered
        : this.config.get<string>('LIVEKIT_SIP_WAIT_UNTIL_ANSWERED') === 'true';

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
        context: prepared.context ?? null,
        voiceTaskSnapshot,
        taskKey: voiceTaskSnapshot
          ? `custom_${voiceTaskSnapshot.taskId}`
          : taskKey,
        attemptCount: 0,
        dialStartedAt: null,
      }),
    );
    initializeCallStatus(call, CallLifecycleEvent.START_IMMEDIATE);
    call = await this.callsRepository.save(call);

    try {
      await this.queueSettingsService.getOrCreate(dto.organizationId);
      call = await this.queueAdmission.admitImmediate(
        dto.organizationId,
        call.id,
      );
      call = await this.executeSipDial({
        call,
        orgAgent,
        taskKey,
        enabledTools,
        trunkLivekitId: trunk.livekitTrunkId!,
        fromNumber,
        toNumber,
        participantIdentity,
        context: prepared.context,
        shouldWait,
        roomName,
      });
      return toCallResponse(call);
    } catch (err) {
      const message = this.formatSipError(err);
      if (err instanceof OpeningPreparationError) {
        const current = await this.callsRepository.findById(call.id);
        if (
          current?.status === CallStatus.DIALING &&
          current.roomName === call.roomName
        ) {
          current.errorMessage = message;
          await this.callFailure.applyFailure({
            call: current,
            failureCode: CallFailureCode.OPENING_PREPARATION_FAILED,
            priceBeforeReset: true,
          });
        }
        throw err;
      }
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
   * Begin one admitted call under its lease, then prepare/dial outside the transaction.
   * On failure applies retry policy instead of always terminal failed.
   */
  async dialClaimedCall(admissionId: string): Promise<Call | null> {
    let call = await this.queueAdmission.beginDial(admissionId);
    if (!call) return null;
    try {
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
        resolveOrgAgentTaskKey(this.logger, null, orgAgent, template);
      const enabledTools = await this.toolProfilesService.resolveEnabledToolIds(
        orgAgent.toolProfileId ?? template.defaultToolProfileId,
        call.organizationId,
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
        if (err instanceof OpeningPreparationError) {
          const current = await this.callsRepository.findById(call.id);
          if (
            !current ||
            current.status !== CallStatus.DIALING ||
            current.livekitDispatchId !== call.livekitDispatchId
          )
            return current;
          current.errorMessage = message;
          return this.callFailure.applyFailure({
            call: current,
            failureCode: CallFailureCode.OPENING_PREPARATION_FAILED,
            priceBeforeReset: true,
          });
        }
        const sipCode = this.extractSipStatusCode(err);
        const failureCode = this.queueRetryService.classifyFromSipError(
          message,
          sipCode,
        );
        call.errorMessage = message;
        return this.callFailure.applyFailure({ call, failureCode });
      }
    } catch (err) {
      call.errorMessage = this.formatSipError(err);
      return this.callFailure.applyFailure({
        call,
        failureCode: CallFailureCode.UNKNOWN,
      });
    }
  }

  private async executeSipDial(input: {
    call: Call;
    orgAgent: OrganizationAgent;
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

    const prepared = call.voiceTaskSnapshot
      ? await this.organizationAgentsService.prepareVoiceTask(
          orgAgent,
          call.voiceTaskSnapshot,
          enabledTools,
          context,
        )
      : { context, enabledTools };
    const metadata = packOrgAgentJobMetadata(orgAgent, {
      voiceTask: call.voiceTaskSnapshot,
      task: taskKey,
      enabledTools: prepared.enabledTools,
      direction: AgentDirection.OUTBOUND,
      medium: CallMedium.SIP,
      callId: call.id,
      context: prepared.context,
      participantIdentity,
    });
    if (requiresOpeningPreparation(metadata))
      metadata.openingPreparation = {
        version: 1,
        attemptId: randomUUID(),
        deadline: Date.now() + OPENING_PREPARATION_TIMEOUT_MS,
      };

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

    if (metadata.openingPreparation)
      metadata.openingPreparation.deadline =
        Date.now() + OPENING_PREPARATION_TIMEOUT_MS;
    const dispatch = await this.livekit.createAgentDispatch({
      roomName,
      metadata: JSON.stringify(metadata),
    });
    call.livekitDispatchId = dispatch.id;
    if (call.status === CallStatus.CREATING) {
      applyCallEvent(call, CallLifecycleEvent.DISPATCH, CallStatus.DIALING);
    }
    call.startedAt = call.startedAt ?? new Date();
    call.queueLockedAt = null;
    call = await this.callsRepository.save(call);

    if (metadata.openingPreparation) {
      try {
        await this.awaitOpeningPreparation(call, metadata.openingPreparation);
      } catch {
        await this.livekit.deleteRoom(roomName);
        throw new OpeningPreparationError();
      }
    }

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

  private async awaitOpeningPreparation(
    call: Call,
    gate: OpeningPreparation,
  ): Promise<void> {
    while (Date.now() < gate.deadline) {
      const current = await this.callsRepository.findById(call.id);
      if (
        !current ||
        current.status !== CallStatus.DIALING ||
        current.roomName !== call.roomName ||
        current.livekitDispatchId !== call.livekitDispatchId
      )
        throw new OpeningPreparationError();
      const report = await this.livekit.openingPreparationReport(
        call.roomName!,
        call.livekitDispatchId!,
        gate.attemptId,
      );
      if (report) {
        call.usage = report.usage;
        await this.callsRepository.updateOpeningPreparationUsage(call);
      }
      if (report?.status === 'failed') throw new OpeningPreparationError();
      if (report?.status === 'ready') {
        const { orgAgent, template } = await requireActiveOrgAgent(
          this.organizationAgentsService,
          call.organizationId!,
          call.organizationAgentId!,
        );
        if (
          !template.isActive ||
          !(await this.organizationAgentsService.isOrganizationActive(
            call.organizationId!,
          ))
        )
          throw new OpeningPreparationError();
        const latest = await this.callsRepository.findById(call.id);
        if (
          !latest ||
          latest.status !== CallStatus.DIALING ||
          latest.roomName !== call.roomName ||
          latest.livekitDispatchId !== call.livekitDispatchId ||
          Date.now() >= gate.deadline
        )
          throw new OpeningPreparationError();
        const confirmed = await this.livekit.openingPreparationReport(
          call.roomName!,
          call.livekitDispatchId!,
          gate.attemptId,
        );
        if (confirmed?.status !== 'ready' || Date.now() >= gate.deadline)
          throw new OpeningPreparationError();
        const final = await this.callsRepository.findById(call.id);
        if (
          !final ||
          final.status !== CallStatus.DIALING ||
          final.roomName !== call.roomName ||
          final.livekitDispatchId !== call.livekitDispatchId
        )
          throw new OpeningPreparationError();
        this.logger.log(
          `Opening preparation ready call=${call.id}; SIP submission permitted`,
        );
        return;
      }
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(250, Math.max(0, gate.deadline - Date.now())),
        ),
      );
    }
    throw new OpeningPreparationError();
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

  private async resolveOutboundFrom(
    organizationId: string,
    sipTrunkId?: string,
  ): Promise<{ trunk: SipTrunk; fromNumber: string }> {
    const trunk = await this.sipTrunksService.resolveOutboundForCall(
      organizationId,
      sipTrunkId,
    );
    const fromNumber = pickFromNumber(trunk.numbers, this.defaultCountryCode());
    if (!fromNumber) {
      throw new BadRequestException(
        `SIP trunk has no from numbers configured: ${trunk.id}`,
      );
    }
    return { trunk, fromNumber };
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
