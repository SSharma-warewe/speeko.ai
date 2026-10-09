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

export type CallControlPatch = Partial<Pick<Call, | 'status' | 'endedAt' | 'nextAttemptAt' |
  'queueLockedAt' | 'lastFailureCode' | 'lastFailureAt' | 'errorMessage' | 'priority' |
  'maxAttempts' | 'roomName' | 'livekitDispatchId' | 'livekitSipCallId'>>;

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
  async updateCost(call: Call): Promise<void> {
    await this.repo.update(call.id, { cost: call.cost, costUsd: call.costUsd });
  }

  /** Preparation accounting is field-only and fenced to the current dispatch. */
  async updateOpeningPreparationUsage(call: Call): Promise<void> {
    await this.repo.createQueryBuilder().update(Call)
      .set({ usage: () => ':openingUsage' })
      .where({ id: call.id, roomName: call.roomName!, livekitDispatchId: call.livekitDispatchId!, status: CallStatus.DIALING })
      .setParameter('openingUsage', JSON.stringify(call.usage)).execute();
  }

  /** Field-only control write; a stale pending view cannot undo queue admission. */
  async updateIfStatus(id: string, organizationId: string, status: CallStatus, patch: CallControlPatch,
  ): Promise<Call | null> {
    return this.repo.manager.transaction(async (manager ) => {
      const result = await manager.update(Call, { id, organizationId, status }, patch,
      );
      return result.affected ? manager.findOneByOrFail(Call, { id, organizationId }) : null;
    });
  }

  findById(id: string): Promise<Call | null> {
    return this.repo.findOne({ where: { id }, relations: { humanSession: true } ,
    });
  }

  findByRoomName(roomName: string): Promise<Call | null> {
    return this.repo.findOne({ where: { roomName } });
  }

  findByIdAndOrganization(
    id: string,
    organizationId: string,
  ): Promise<Call | null> {
    return this.repo.findOne({ where: { id, organizationId }, relations: { humanSession: true } ,
    });
  }

  findRecent(limit = 50): Promise<Call[]> {
    return this.repo.find({
      relations: { humanSession: true },
      order: { createdAt: 'DESC' },
      take: limit,
    });
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
      relations: { humanSession: true },
      order: { createdAt: 'DESC' },
      take: filter.limit ?? 50,
    });
  }

  getRepository(): Repository<Call> {
    return this.repo;
  }
}
