import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Not, Repository } from 'typeorm';
import { OrganizationAgent } from './organization-agent.entity';

@Injectable()
export class OrganizationAgentsRepository {
  constructor(
    @InjectRepository(OrganizationAgent)
    private readonly repo: Repository<OrganizationAgent>,
  ) {}

  findByIdAndOrgWithAgent(
    organizationId: string,
    id: string,
  ): Promise<OrganizationAgent | null> {
    return this.repo.findOne({
      where: { id, organizationId },
      relations: { agent: true },
    });
  }

  findByOrganizationWithAgent(
    organizationId: string,
  ): Promise<OrganizationAgent[]> {
    return this.repo.find({
      where: { organizationId },
      relations: { agent: true },
      order: { createdAt: 'DESC' },
    });
  }

  findByOrgAndSlug(
    organizationId: string,
    slug: string,
  ): Promise<OrganizationAgent | null> {
    return this.repo.findOne({
      where: { organizationId, slug },
    });
  }

  /** All slugs currently used by the org (for unique allocation). */
  async listSlugsByOrganization(organizationId: string): Promise<string[]> {
    const rows = await this.repo.find({
      where: { organizationId },
      select: ['slug'],
    });
    return rows.map((r) => r.slug).filter(Boolean);
  }

  async listSlugsByOrganizationExcluding(
    organizationId: string,
    excludeId: string,
  ): Promise<string[]> {
    const rows = await this.repo.find({
      where: { organizationId, id: Not(excludeId) },
      select: ['slug'],
    });
    return rows.map((r) => r.slug).filter(Boolean);
  }

  create(data: DeepPartial<OrganizationAgent>): OrganizationAgent {
    return this.repo.create(data);
  }

  save(row: OrganizationAgent): Promise<OrganizationAgent> {
    return this.repo.save(row);
  }

  remove(row: OrganizationAgent): Promise<OrganizationAgent> {
    return this.repo.remove(row);
  }
}
