import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { CallBatch, CallBatchStatus } from './call-batch.entity';

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

  findByIdAndOrganization(
    id: string,
    organizationId: string,
  ): Promise<CallBatch | null> {
    return this.repo.findOne({ where: { id, organizationId } });
  }

  findByOrganization(
    organizationId: string,
    limit = 50,
  ): Promise<CallBatch[]> {
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
