import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CallFailureCode } from '../calls/call.entity';
import { OrganizationsService } from '../organizations/organizations.service';
import { UpdateQueueSettingsDto } from './dto/update-queue-settings.dto';
import {
  OrganizationQueueSettings,
  QueueBackoffStrategy,
} from './organization-queue-settings.entity';
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
  async getOrCreate(organizationId: string): Promise<OrganizationQueueSettings> {
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
    return this.repo.save(settings);
  }

  async update(
    organizationId: string,
    dto: UpdateQueueSettingsDto,
  ): Promise<OrganizationQueueSettings> {
    const settings = await this.getOrCreate(organizationId);

    if (dto.enabled !== undefined) settings.enabled = dto.enabled;
    if (dto.paused !== undefined) settings.paused = dto.paused;
    if (dto.maxConcurrent !== undefined) {
      settings.maxConcurrent = dto.maxConcurrent;
    }
    if (dto.maxDialsPerMinute !== undefined) {
      settings.maxDialsPerMinute = dto.maxDialsPerMinute;
    }
    if (dto.defaultMaxAttempts !== undefined) {
      settings.defaultMaxAttempts = dto.defaultMaxAttempts;
    }
    if (dto.backoffStrategy !== undefined) {
      settings.backoffStrategy = dto.backoffStrategy as QueueBackoffStrategy;
    }
    if (dto.backoffBaseSeconds !== undefined) {
      settings.backoffBaseSeconds = dto.backoffBaseSeconds;
    }
    if (dto.backoffMaxSeconds !== undefined) {
      settings.backoffMaxSeconds = dto.backoffMaxSeconds;
    }
    if (dto.retryOn !== undefined) {
      settings.retryOn = dto.retryOn as CallFailureCode[];
    }
    if (dto.quietHoursEnabled !== undefined) {
      settings.quietHoursEnabled = dto.quietHoursEnabled;
    }
    if (dto.quietHoursStart !== undefined) {
      settings.quietHoursStart = dto.quietHoursStart;
    }
    if (dto.quietHoursEnd !== undefined) {
      settings.quietHoursEnd = dto.quietHoursEnd;
    }
    if (dto.quietHoursTimezone !== undefined) {
      settings.quietHoursTimezone = dto.quietHoursTimezone;
    }
    if (dto.claimBatchSize !== undefined) {
      settings.claimBatchSize = dto.claimBatchSize;
    }

    return this.repo.save(settings);
  }

  async setPaused(
    organizationId: string,
    paused: boolean,
  ): Promise<OrganizationQueueSettings> {
    const settings = await this.getOrCreate(organizationId);
    settings.paused = paused;
    return this.repo.save(settings);
  }

  async findEnabledAndNotPaused(): Promise<OrganizationQueueSettings[]> {
    return this.repo.findEnabledAndNotPaused();
  }

  async findAll(): Promise<OrganizationQueueSettings[]> {
    return this.repo.findAll();
  }
}
