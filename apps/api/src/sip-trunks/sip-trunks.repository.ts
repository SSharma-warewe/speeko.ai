import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, In, IsNull, Repository } from 'typeorm';
import { SipTrunk, SipTrunkDirection } from './sip-trunk.entity';

@Injectable()
export class SipTrunksRepository {
  constructor(
    @InjectRepository(SipTrunk)
    private readonly repo: Repository<SipTrunk>,
  ) {}

  create(data: DeepPartial<SipTrunk>): SipTrunk {
    return this.repo.create(data);
  }

  save(row: SipTrunk): Promise<SipTrunk> {
    return this.repo.save(row);
  }

  findByIdAndOrg(organizationId: string, id: string): Promise<SipTrunk | null> {
    return this.repo.findOne({ where: { id, organizationId } });
  }

  findByOrganization(organizationId: string): Promise<SipTrunk[]> {
    return this.repo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  findByOrganizationAndDirection(
    organizationId: string,
    direction: SipTrunkDirection,
  ): Promise<SipTrunk[]> {
    return this.repo.find({
      where: { organizationId, direction },
      order: { createdAt: 'DESC' },
    });
  }

  findInboundDrafts(organizationId: string): Promise<SipTrunk[]> {
    return this.repo.find({
      where: {
        organizationId,
        direction: SipTrunkDirection.INBOUND,
        livekitTrunkId: IsNull(),
      },
      order: { createdAt: 'ASC' },
    });
  }

  findByIdsAndOrg(
    organizationId: string,
    ids: string[],
  ): Promise<SipTrunk[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.repo.find({
      where: { organizationId, id: In(ids) },
      order: { createdAt: 'ASC' },
    });
  }

  findActiveOutboundDefault(organizationId: string): Promise<SipTrunk | null> {
    return this.repo.findOne({
      where: {
        organizationId,
        isActive: true,
        direction: SipTrunkDirection.OUTBOUND,
      },
      order: { createdAt: 'ASC' },
    });
  }

  findByLivekitTrunkId(livekitTrunkId: string): Promise<SipTrunk | null> {
    return this.repo.findOne({ where: { livekitTrunkId } });
  }

  remove(row: SipTrunk): Promise<SipTrunk> {
    return this.repo.remove(row);
  }
}
