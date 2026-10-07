import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrganizationsService } from '../organizations/organizations.service';
import { UpdateQueueSettingsDto } from './dto/update-queue-settings.dto';
import { OrganizationQueueSettings } from './organization-queue-settings.entity';
import { OrganizationQueueSettingsRepository } from './organization-queue-settings.repository';
import { QUEUE_DEFAULTS, queuePositiveInt } from './queue.defaults';

@Injectable()
export class OrganizationQueueSettingsService {
  constructor(
    private readonly repo: OrganizationQueueSettingsRepository,
    private readonly organizationsService: OrganizationsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Load settings or create with platform defaults (lazy seed).
   */
  async getOrCreate(
    organizationId: string,
  ): Promise<OrganizationQueueSettings> {
    await this.organizationsService.findById(organizationId);
    const existing = await this.repo.findByOrganizationId(organizationId);
    if (existing) {
      return existing;
    }
    return this.createDefaults(organizationId);
  }

  private async createDefaults(
    organizationId: string,
  ): Promise<OrganizationQueueSettings> {
    const existing = await this.repo.findByOrganizationId(organizationId);
    if (existing) {
      return existing;
    }

    const settings = this.repo.create({
      organizationId,
      enabled: true,
      paused: false,
      maxConcurrent: queuePositiveInt(
        this.config.get('QUEUE_DEFAULT_MAX_CONCURRENT'),
        QUEUE_DEFAULTS.maxConcurrent,
      ),
      maxDialsPerMinute: queuePositiveInt(
        this.config.get('QUEUE_DEFAULT_MAX_DIALS_PER_MINUTE'),
        QUEUE_DEFAULTS.maxDialsPerMinute,
      ),
      defaultMaxAttempts: queuePositiveInt(
        this.config.get('QUEUE_DEFAULT_MAX_ATTEMPTS'),
        QUEUE_DEFAULTS.defaultMaxAttempts,
      ),
      backoffStrategy: QUEUE_DEFAULTS.backoffStrategy,
      backoffBaseSeconds: QUEUE_DEFAULTS.backoffBaseSeconds,
      backoffMaxSeconds: QUEUE_DEFAULTS.backoffMaxSeconds,
      retryOn: [...QUEUE_DEFAULTS.retryOn],
      quietHoursEnabled: false,
      quietHoursStart: null,
      quietHoursEnd: null,
      quietHoursTimezone: QUEUE_DEFAULTS.quietHoursTimezone,
      claimBatchSize: QUEUE_DEFAULTS.claimBatchSize,
    });
    return this.repo.insertDefaults(settings);
  }

  async update(
    organizationId: string,
    dto: UpdateQueueSettingsDto,
  ): Promise<OrganizationQueueSettings> {
    await this.getOrCreate(organizationId);
    const fields: Array<keyof UpdateQueueSettingsDto> = [
      'enabled',
      'paused',
      'maxConcurrent',
      'maxDialsPerMinute',
      'defaultMaxAttempts',
      'backoffStrategy',
      'backoffBaseSeconds',
      'backoffMaxSeconds',
      'retryOn',
      'quietHoursEnabled',
      'quietHoursStart',
      'quietHoursEnd',
      'quietHoursTimezone',
      'claimBatchSize',
    ];
    const patch = Object.fromEntries(
      fields
        .filter((key) => dto[key] !== undefined)
        .map((key) => [key, dto[key]]),
    );
    return this.repo.updateLocked(organizationId, patch);
  }

  async setPaused(
    organizationId: string,
    paused: boolean,
  ): Promise<OrganizationQueueSettings> {
    await this.getOrCreate(organizationId);
    return this.repo.updateLocked(organizationId, { paused });
  }

  async findEnabledAndNotPaused(): Promise<OrganizationQueueSettings[]> {
    return this.repo.findEnabledAndNotPaused();
  }

  async findAll(): Promise<OrganizationQueueSettings[]> {
    return this.repo.findAll();
  }
}
