import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CallStatus } from '../calls/call.entity';
import { CallBatch, CallBatchStatus } from './call-batch.entity';
import { CallBatchesRepository } from './call-batches.repository';
import {
  CallBatchResponseDto,
  CallBatchStatsDto,
} from './dto/call-batch-response.dto';
import { toCallBatchResponse } from './mappers/call-batch.mapper';

@Injectable()
export class CallBatchesService {
  constructor(
    private readonly repo: CallBatchesRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async createBatch(input: {
    id: string;
    organizationId: string;
    organizationAgentId: string;
    sipTrunkId: string | null;
    taskKey: string | null;
    maxAttempts: number | null;
    maxConcurrent: number | null;
    priority: number;
    totalCount: number;
  }): Promise<CallBatch> {
    const batch = this.repo.create({
      id: input.id,
      organizationId: input.organizationId,
      status: CallBatchStatus.RUNNING,
      organizationAgentId: input.organizationAgentId,
      sipTrunkId: input.sipTrunkId,
      taskKey: input.taskKey,
      maxAttempts: input.maxAttempts,
      maxConcurrent: input.maxConcurrent,
      priority: input.priority,
      totalCount: input.totalCount,
      pausedAt: null,
      cancelledAt: null,
    });
    return this.repo.save(batch);
  }

  async listForOrg(
    organizationId: string,
    limit = 50,
  ): Promise<CallBatchResponseDto[]> {
    const rows = await this.repo.findByOrganization(organizationId, limit);
    return rows.map((batch) => toCallBatchResponse(batch));
  }

  async getForOrg(
    organizationId: string,
    batchId: string,
  ): Promise<CallBatchResponseDto> {
    const batch = await this.requireForOrg(organizationId, batchId);
    const stats = await this.statsForBatch(batchId);
    return toCallBatchResponse(batch, stats);
  }

  async pause(
    organizationId: string,
    batchId: string,
  ): Promise<CallBatchResponseDto> {
    const batch = await this.requireForOrg(organizationId, batchId);
    if (batch.status === CallBatchStatus.CANCELLED) {
      throw new BadRequestException('Cannot pause a cancelled batch');
    }
    if (batch.status === CallBatchStatus.COMPLETED) {
      throw new BadRequestException('Cannot pause a completed batch');
    }
    batch.status = CallBatchStatus.PAUSED;
    batch.pausedAt = new Date();
    const saved = await this.repo.save(batch);
    return toCallBatchResponse(saved);
  }

  async resume(
    organizationId: string,
    batchId: string,
  ): Promise<CallBatchResponseDto> {
    const batch = await this.requireForOrg(organizationId, batchId);
    if (batch.status === CallBatchStatus.CANCELLED) {
      throw new BadRequestException('Cannot resume a cancelled batch');
    }
    if (batch.status === CallBatchStatus.COMPLETED) {
      throw new BadRequestException('Cannot resume a completed batch');
    }
    batch.status = CallBatchStatus.RUNNING;
    batch.pausedAt = null;
    const saved = await this.repo.save(batch);
    return toCallBatchResponse(saved);
  }

  async cancel(
    organizationId: string,
    batchId: string,
  ): Promise<CallBatchResponseDto> {
    const batch = await this.requireForOrg(organizationId, batchId);
    if (batch.status === CallBatchStatus.CANCELLED) {
      return toCallBatchResponse(batch);
    }

    batch.status = CallBatchStatus.CANCELLED;
    batch.cancelledAt = new Date();
    await this.repo.save(batch);

    await this.dataSource.query(
      `
      UPDATE calls
      SET
        status = $1,
        ended_at = NOW(),
        next_attempt_at = NULL,
        queue_locked_at = NULL,
        last_failure_code = $2,
        last_failure_at = NOW(),
        error_message = COALESCE(error_message, 'Batch cancelled'),
        updated_at = NOW()
      WHERE batch_id = $3
        AND organization_id = $4
        AND status = $5
      `,
      [
        CallStatus.CANCELLED,
        'cancelled',
        batchId,
        organizationId,
        CallStatus.PENDING,
      ],
    );

    return toCallBatchResponse(batch);
  }

  async maybeMarkCompleted(batchId: string): Promise<void> {
    const pending = await this.dataSource.query(
      `
      SELECT COUNT(*)::int AS cnt
      FROM calls
      WHERE batch_id = $1
        AND status = ANY($2::text[])
      `,
      [
        batchId,
        [
          CallStatus.PENDING,
          CallStatus.CREATING,
          CallStatus.DIALING,
          CallStatus.READY,
        ],
      ],
    );
    if (Number(pending[0]?.cnt ?? 0) > 0) {
      return;
    }
    await this.dataSource.query(
      `
      UPDATE call_batches
      SET status = $1, updated_at = NOW()
      WHERE id = $2
        AND status = $3
      `,
      [CallBatchStatus.COMPLETED, batchId, CallBatchStatus.RUNNING],
    );
  }

  async requireForOrg(
    organizationId: string,
    batchId: string,
  ): Promise<CallBatch> {
    const batch = await this.repo.findByIdAndOrganization(
      batchId,
      organizationId,
    );
    if (!batch) {
      throw new NotFoundException(`Batch not found: ${batchId}`);
    }
    return batch;
  }

  async statsForBatch(batchId: string): Promise<CallBatchStatsDto> {
    const rows = await this.dataSource.query(
      `
      SELECT status, COUNT(*)::int AS cnt
      FROM calls
      WHERE batch_id = $1
      GROUP BY status
      `,
      [batchId],
    );
    const byStatus: Record<string, number> = {};
    for (const r of rows) {
      byStatus[r.status] = Number(r.cnt);
    }
    return {
      pending: byStatus[CallStatus.PENDING] ?? 0,
      creating: byStatus[CallStatus.CREATING] ?? 0,
      dialing: byStatus[CallStatus.DIALING] ?? 0,
      ready: byStatus[CallStatus.READY] ?? 0,
      completed: byStatus[CallStatus.COMPLETED] ?? 0,
      incomplete: byStatus[CallStatus.INCOMPLETE] ?? 0,
      failed: byStatus[CallStatus.FAILED] ?? 0,
      cancelled: byStatus[CallStatus.CANCELLED] ?? 0,
    };
  }
}
