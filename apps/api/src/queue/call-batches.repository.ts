import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { CallBatch, CallBatchStatus } from './call-batch.entity';
import { OrganizationQueueSettings } from './organization-queue-settings.entity';

@Injectable()
export class CallBatchesRepository {
  constructor(
    @InjectRepository(CallBatch)
    private readonly repo: Repository<CallBatch>,
  ) {}

  create(data: DeepPartial<CallBatch>): CallBatch {
    return this.repo.create(data);
  }

  save(batch: CallBatch): Promise<CallBatch> {
    return this.repo.save(batch);
  }

  transition(
    organizationId: string,
    batchId: string,
    action: 'pause' | 'resume' | 'cancel',
  ): Promise<CallBatch> {
    return this.repo.manager.transaction('READ COMMITTED', async (manager) => {
      await manager.findOne(OrganizationQueueSettings, {
        where: { organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      const batch = await manager.findOne(CallBatch, {
        where: { id: batchId, organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!batch) throw new NotFoundException(`Batch not found: ${batchId}`);
      if (
        action !== 'cancel' &&
        (batch.status === CallBatchStatus.CANCELLED ||
          batch.status === CallBatchStatus.COMPLETED)
      ) {
        throw new BadRequestException(
          `Cannot ${action} a ${batch.status} batch`,
        );
      }
      if (action === 'cancel' && batch.status === CallBatchStatus.CANCELLED)
        return batch;
      batch.status =
        action === 'pause'
          ? CallBatchStatus.PAUSED
          : action === 'resume'
            ? CallBatchStatus.RUNNING
            : CallBatchStatus.CANCELLED;
      if (action === 'cancel') batch.cancelledAt = new Date();
      else batch.pausedAt = action === 'pause' ? new Date() : null;
      const saved = await manager.save(batch);
      if (action === 'cancel') {
        // CANCEL: pending -> cancelled. Already admitted calls continue.
        await manager.query(
          `UPDATE calls SET status = 'cancelled', ended_at = clock_timestamp(),
          next_attempt_at = NULL, queue_locked_at = NULL, last_failure_code = 'cancelled',
          last_failure_at = clock_timestamp(), error_message = COALESCE(error_message, 'Batch cancelled'),
          updated_at = clock_timestamp()
          WHERE organization_id = $1 AND batch_id = $2 AND status = 'pending'`,
          [organizationId, batchId],
        );
      }
      return saved;
    });
  }

  findByIdAndOrganization(
    id: string,
    organizationId: string,
  ): Promise<CallBatch | null> {
    return this.repo.findOne({ where: { id, organizationId } });
  }

  findByOrganization(organizationId: string, limit = 50): Promise<CallBatch[]> {
    return this.repo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  countByOrganizationAndStatus(
    organizationId: string,
    status: CallBatchStatus,
  ): Promise<number> {
    return this.repo.count({ where: { organizationId, status } });
  }
}
