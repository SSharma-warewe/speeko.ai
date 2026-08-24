import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AgentDirection } from '../../agents/agent.entity';
import { AgentsService } from '../../agents/agents.service';
import { OrganizationAgentsService } from '../../agents/organization-agents.service';
import { LivekitService } from '../../livekit/livekit.service';
import { CallBatchesService } from '../../queue/call-batches.service';
import { QueueRetryService } from '../../queue/queue-retry.service';
import { PriceService } from '../../price/price.service';
import { SipTrunksService } from '../../sip-trunks/sip-trunks.service';
import { CallFailureService } from './call-failure.service';
import { newCallRow } from '../lib/call-row';
import { priceAttemptSafe } from '../lib/call-price';
import {
  applyCallEvent,
  CallLifecycleEvent,
  initializeCallStatus,
  isTerminalCallStatus,
} from '../lib/call-state-machine';
import { resolveTaskKey } from '../lib/call-task-key';
import { workerReportedTaskCompleted } from '../lib/worker-task-completed';
import {
  Call,
  CallMedium,
  CallStatus,
  CallTranscriptItem,
  CallUsageSnapshot,
} from '../call.entity';
import { CallsRepository } from '../calls.repository';
import { CompleteCallDto } from '../dto/complete-call.dto';
import { EnsureInboundCallDto } from '../dto/ensure-inbound-call.dto';
import { CallResponseDto } from '../dto/call-response.dto';
import { toAdminCallResponse } from '../mappers/call-response.mapper';

@Injectable()
export class CallWorkerService {
  private readonly logger = new Logger(CallWorkerService.name);

  constructor(
    private readonly callsRepository: CallsRepository,
    private readonly agentsService: AgentsService,
    private readonly organizationAgentsService: OrganizationAgentsService,
    private readonly sipTrunksService: SipTrunksService,
    private readonly livekit: LivekitService,
    private readonly priceService: PriceService,
    @Inject(forwardRef(() => CallBatchesService))
    private readonly callBatchesService: CallBatchesService,
    @Inject(forwardRef(() => QueueRetryService))
    private readonly queueRetryService: QueueRetryService,
    private readonly callFailure: CallFailureService,
  ) {}

  /**
   * Worker job start for inbound SIP. Upserts by LiveKit `roomName` so a
   * unique callId exists for the existing complete callback. Dispatch-rule
   * metadata is static (no per-ring callId).
   */
  async ensureInboundFromWorker(
    dto: EnsureInboundCallDto,
  ): Promise<CallResponseDto> {
    const roomName = dto.roomName?.trim();
    if (!roomName) {
      throw new BadRequestException('roomName is required');
    }

    const existing = await this.callsRepository.findByRoomName(roomName);
    if (existing) {
      if (isTerminalCallStatus(existing.status)) {
        return toAdminCallResponse(existing);
      }
      if (this.applyInboundSipDetails(existing, dto)) {
        const saved = await this.callsRepository.save(existing);
        return toAdminCallResponse(saved);
      }
      return toAdminCallResponse(existing);
    }

    const { organizationAgentId, agentId } =
      await this.resolveInboundAgent(dto);
    const sipTrunkId = await this.resolveInboundTrunkId(dto);
    const fromNumber = this.trimOrNull(dto.fromNumber);
    const toNumber = this.trimOrNull(dto.toNumber);
    const participantIdentity =
      this.trimOrNull(dto.participantIdentity) ?? fromNumber;
    const taskKey = resolveTaskKey(this.logger, dto.task);
    const now = new Date();

    let call = this.callsRepository.create(
      newCallRow({
        organizationId: dto.organizationId?.trim() || null,
        organizationAgentId,
        agentId,
        sipTrunkId,
        direction: AgentDirection.INBOUND,
        medium: CallMedium.SIP,
        roomName,
        livekitAgentName: this.livekit.getAgentName(),
        livekitSipCallId: this.trimOrNull(dto.livekitSipCallId),
        participantIdentity,
        fromNumber,
        toNumber,
        context: this.buildInboundContext(dto, fromNumber, toNumber),
        taskKey,
        attemptCount: 1,
        dialStartedAt: now,
        startedAt: now,
      }),
    );
    initializeCallStatus(call, CallLifecycleEvent.START_IMMEDIATE);
    applyCallEvent(call, CallLifecycleEvent.DISPATCH, CallStatus.READY);

    call = await this.callsRepository.save(call);
    this.logger.log(
      `Inbound SIP call ready id=${call.id} room=${roomName} ` +
        `org=${call.organizationId ?? 'n/a'} orgAgent=${call.organizationAgentId ?? 'n/a'} ` +
        `from=${fromNumber ?? 'n/a'} to=${toNumber ?? 'n/a'} task=${taskKey}`,
    );
    return toAdminCallResponse(call);
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
      await priceAttemptSafe(this.priceService, this.logger, call, 'fill');
      const saved = await this.callsRepository.save(call);
      return toAdminCallResponse(saved);
    }

    // Late callback after sweeper requeue (pending) or claim (creating) must
    // not clobber nextAttemptAt / fail the next attempt. Terminal fill is above.
    if (
      call.status !== CallStatus.DIALING &&
      call.status !== CallStatus.READY
    ) {
      this.logger.warn(
        `Ignoring worker complete for call id=${call.id} status=${call.status} ` +
          `(not dialing/ready; late callback after requeue or claim)`,
      );
      return toAdminCallResponse(call);
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
      await priceAttemptSafe(this.priceService, this.logger, call, 'append');
      const saved = await this.callsRepository.save(call);
      if (saved.batchId) {
        await this.callBatchesService.maybeMarkCompleted(saved.batchId);
      }
      this.logger.log(
        `Call complete id=${saved.id} status=${saved.status} ` +
          `task=${saved.taskKey ?? 'n/a'} taskStatus=${saved.taskStatus} ` +
          `transcriptItems=${saved.transcript?.length ?? 0} ` +
          `tools=${this.formatToolEventsSummary(saved.sessionReport)} ` +
          `costUsd=${saved.costUsd ?? 'n/a'}`,
      );
      return toAdminCallResponse(saved);
    }

    // Failed from worker — may requeue under org policy
    const failureCode = this.queueRetryService.classifyFromWorker({
      failureCode: dto.failureCode,
      errorMessage: dto.errorMessage,
    });
    call.endedAt = dto.endedAt ? this.parseDate(dto.endedAt) : new Date();
    const saved = await this.callFailure.applyFailure({
      call,
      failureCode,
      priceBeforeReset: true,
    });
    if (saved.status !== CallStatus.PENDING) {
      this.logger.log(
        `Call complete id=${saved.id} status=${saved.status} ` +
          `task=${saved.taskKey ?? 'n/a'} transcriptItems=${saved.transcript?.length ?? 0} ` +
          `tools=${this.formatToolEventsSummary(saved.sessionReport)}`,
      );
    }
    return toAdminCallResponse(saved);
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

  private trimOrNull(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private applyInboundSipDetails(
    call: Call,
    dto: EnsureInboundCallDto,
  ): boolean {
    let dirty = false;
    const fromNumber = this.trimOrNull(dto.fromNumber);
    const toNumber = this.trimOrNull(dto.toNumber);
    const identity = this.trimOrNull(dto.participantIdentity);
    const sipCallId = this.trimOrNull(dto.livekitSipCallId);
    if (!call.fromNumber && fromNumber) {
      call.fromNumber = fromNumber;
      dirty = true;
    }
    if (!call.toNumber && toNumber) {
      call.toNumber = toNumber;
      dirty = true;
    }
    if (!call.participantIdentity && (identity || fromNumber)) {
      call.participantIdentity = identity ?? fromNumber;
      dirty = true;
    }
    if (!call.livekitSipCallId && sipCallId) {
      call.livekitSipCallId = sipCallId;
      dirty = true;
    }
    return dirty;
  }

  private buildInboundContext(
    dto: EnsureInboundCallDto,
    fromNumber: string | null,
    toNumber: string | null,
  ): Record<string, unknown> | null {
    const context: Record<string, unknown> = {
      ...(dto.context && typeof dto.context === 'object' ? dto.context : {}),
    };
    if (fromNumber) {
      context.fromNumber = fromNumber;
      if (context.phoneNumber == null) {
        context.phoneNumber = fromNumber;
      }
    }
    if (toNumber) {
      context.toNumber = toNumber;
    }
    return Object.keys(context).length > 0 ? context : null;
  }

  private async resolveInboundAgent(dto: EnsureInboundCallDto): Promise<{
    organizationAgentId: string | null;
    agentId: string | null;
  }> {
    const orgId = this.trimOrNull(dto.organizationId);
    const orgAgentId = this.trimOrNull(dto.organizationAgentId);
    if (orgId && orgAgentId) {
      try {
        const orgAgent =
          await this.organizationAgentsService.getEntityWithTemplate(
            orgId,
            orgAgentId,
          );
        return {
          organizationAgentId: orgAgent.id,
          agentId: orgAgent.agentId ?? orgAgent.agent?.id ?? null,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Inbound ensure: org agent ${orgAgentId} org=${orgId} unresolved: ${message}`,
        );
      }
    }

    const agentKey = this.trimOrNull(dto.agentKey);
    if (agentKey) {
      const template = await this.agentsService.findByKey(agentKey);
      return { organizationAgentId: null, agentId: template?.id ?? null };
    }
    return { organizationAgentId: null, agentId: null };
  }

  private async resolveInboundTrunkId(
    dto: EnsureInboundCallDto,
  ): Promise<string | null> {
    const livekitTrunkId = this.trimOrNull(dto.livekitTrunkId);
    if (!livekitTrunkId) {
      return null;
    }
    try {
      const trunk =
        await this.sipTrunksService.findByLivekitTrunkId(livekitTrunkId);
      const orgId = this.trimOrNull(dto.organizationId);
      if (!trunk) {
        return null;
      }
      if (orgId && trunk.organizationId !== orgId) {
        this.logger.warn(
          `Inbound ensure: LiveKit trunk ${livekitTrunkId} belongs to another org`,
        );
        return null;
      }
      return trunk.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Inbound ensure: trunk ${livekitTrunkId} unresolved: ${message}`,
      );
      return null;
    }
  }

  private parseDate(value: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      return new Date();
    }
    return d;
  }
}
