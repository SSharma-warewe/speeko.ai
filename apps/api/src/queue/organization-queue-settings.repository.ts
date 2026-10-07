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

  create(
    data: DeepPartial<OrganizationQueueSettings>,
  ): OrganizationQueueSettings {
    return this.repo.create(data);
  }

  async insertDefaults(
    settings: OrganizationQueueSettings,
  ): Promise<OrganizationQueueSettings> {
    // A concurrent lazy seed must never overwrite live pause/limit changes.
    await this.repo
      .createQueryBuilder()
      .insert()
      .values(settings)
      .orIgnore()
      .execute();
    return this.repo.findOneByOrFail({
      organizationId: settings.organizationId,
    });
  }

  updateLocked(
    organizationId: string,
    patch: Partial<OrganizationQueueSettings>,
  ): Promise<OrganizationQueueSettings> {
    return this.repo.manager.transaction('READ COMMITTED', async (manager) => {
      const settings = await manager.findOneOrFail(OrganizationQueueSettings, {
        where: { organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      Object.assign(settings, patch);
      return manager.save(settings);
    });
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
