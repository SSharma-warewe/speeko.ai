import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { OrganizationQueueSettings } from './organization-queue-settings.entity';

@Injectable()
export class OrganizationQueueSettingsRepository {
  constructor(
    @InjectRepository(OrganizationQueueSettings)
    private readonly repo: Repository<OrganizationQueueSettings>,
  ) {}

  create(data: DeepPartial<OrganizationQueueSettings>): OrganizationQueueSettings {
    return this.repo.create(data);
  }

  save(
    settings: OrganizationQueueSettings,
  ): Promise<OrganizationQueueSettings> {
    return this.repo.save(settings);
  }

  findByOrganizationId(
    organizationId: string,
  ): Promise<OrganizationQueueSettings | null> {
    return this.repo.findOne({ where: { organizationId } });
  }

  findEnabledAndNotPaused(): Promise<OrganizationQueueSettings[]> {
    return this.repo.find({
      where: { enabled: true, paused: false },
      order: { organizationId: 'ASC' },
    });
  }

  findAll(): Promise<OrganizationQueueSettings[]> {
    return this.repo.find({ order: { organizationId: 'ASC' } });
  }
}
