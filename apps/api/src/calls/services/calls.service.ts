import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgentDirection } from '../../agents/agent.entity';
import { CallBatchesService } from '../../queue/call-batches.service';
import {
  applyCallEvent,
  CallLifecycleEvent,
} from '../lib/call-state-machine';
import {
  CALL_BUCKET_STATUSES,
  CallBucket,
  CallFailureCode,
  CallStatus,
} from '../call.entity';
import { CallsRepository } from '../calls.repository';
import { CallResponseDto } from '../dto/call-response.dto';
import {
  toAdminCallResponse,
  toCallResponse,
} from '../mappers/call-response.mapper';

@Injectable()
export class CallsService {
  constructor(
    private readonly callsRepository: CallsRepository,
    @Inject(forwardRef(() => CallBatchesService))
    private readonly callBatchesService: CallBatchesService,
  ) {}

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
    return toAdminCallResponse(call);
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
    return rows.map((call) => toAdminCallResponse(call));
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
    return rows.map((call) => toCallResponse(call));
  }
}
