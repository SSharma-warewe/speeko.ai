import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { IntegrationEndpoint } from './integration-endpoint.entity';

@Injectable()
export class IntegrationEndpointsRepository {
  constructor(
    @InjectRepository(IntegrationEndpoint)
    private readonly repo: Repository<IntegrationEndpoint>,
  ) {}

  create(data: DeepPartial<IntegrationEndpoint>): IntegrationEndpoint {
    return this.repo.create(data);
  }

  save(row: IntegrationEndpoint): Promise<IntegrationEndpoint> {
    return this.repo.save(row);
  }

  findByIdAndOrg(
    organizationId: string,
    id: string,
  ): Promise<IntegrationEndpoint | null> {
    return this.repo.findOne({ where: { id, organizationId } });
  }

  findByOrganization(organizationId: string): Promise<IntegrationEndpoint[]> {
    return this.repo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  findByPublicId(publicId: string): Promise<IntegrationEndpoint | null> {
    return this.repo.findOne({ where: { publicId } });
  }

  remove(row: IntegrationEndpoint): Promise<IntegrationEndpoint> {
    return this.repo.remove(row);
  }
}
