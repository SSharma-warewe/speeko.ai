import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindOptionsWhere, In, Repository } from 'typeorm';
import { AgentDirection } from '../agents/agent.entity';
import { Call, CallStatus } from './call.entity';

export type ListCallsFilter = {
  limit?: number;
  statuses?: CallStatus[];
  batchId?: string;
  direction?: AgentDirection;
};

@Injectable()
export class CallsRepository {
  constructor(
    @InjectRepository(Call)
    private readonly repo: Repository<Call>,
  ) {}

  create(data: DeepPartial<Call>): Call {
    return this.repo.create(data);
  }

  save(call: Call): Promise<Call> {
    return this.repo.save(call);
  }

  saveMany(calls: Call[]): Promise<Call[]> {
    return this.repo.save(calls);
  }

  findById(id: string): Promise<Call | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByRoomName(roomName: string): Promise<Call | null> {
    return this.repo.findOne({ where: { roomName } });
  }

  findByIdAndOrganization(
    id: string,
    organizationId: string,
  ): Promise<Call | null> {
    return this.repo.findOne({ where: { id, organizationId } });
  }

  findRecent(limit = 50): Promise<Call[]> {
    return this.repo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  findRecentByOrganization(
    organizationId: string,
    limit = 50,
  ): Promise<Call[]> {
    return this.findByOrganization(organizationId, { limit });
  }

  findByOrganization(
    organizationId: string,
    filter: ListCallsFilter = {},
  ): Promise<Call[]> {
    const where: FindOptionsWhere<Call> = { organizationId };

    if (filter.batchId) {
      where.batchId = filter.batchId;
    }

    if (filter.direction) {
      where.direction = filter.direction;
    }

    if (filter.statuses?.length === 1) {
      where.status = filter.statuses[0];
    } else if (filter.statuses && filter.statuses.length > 1) {
      where.status = In(filter.statuses);
    }

    return this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: filter.limit ?? 50,
    });
  }

  getRepository(): Repository<Call> {
    return this.repo;
  }
}
