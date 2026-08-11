import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, In, IsNull, Repository } from 'typeorm';
import { SipDispatchRule } from './sip-dispatch-rule.entity';

@Injectable()
export class SipDispatchRulesRepository {
  constructor(
    @InjectRepository(SipDispatchRule)
    private readonly repo: Repository<SipDispatchRule>,
  ) {}

  create(data: DeepPartial<SipDispatchRule>): SipDispatchRule {
    return this.repo.create(data);
  }

  save(row: SipDispatchRule): Promise<SipDispatchRule> {
    return this.repo.save(row);
  }

  findByIdAndOrg(
    organizationId: string,
    id: string,
  ): Promise<SipDispatchRule | null> {
    return this.repo.findOne({ where: { id, organizationId } });
  }

  findByOrganization(organizationId: string): Promise<SipDispatchRule[]> {
    return this.repo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  findDraftsByOrganization(organizationId: string): Promise<SipDispatchRule[]> {
    return this.repo.find({
      where: { organizationId, livekitDispatchRuleId: IsNull() },
      order: { createdAt: 'ASC' },
    });
  }

  findByIdsAndOrg(
    organizationId: string,
    ids: string[],
  ): Promise<SipDispatchRule[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.repo.find({
      where: { organizationId, id: In(ids) },
      order: { createdAt: 'ASC' },
    });
  }

  remove(row: SipDispatchRule): Promise<SipDispatchRule> {
    return this.repo.remove(row);
  }
}
