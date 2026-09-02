import { NotFoundException } from '@nestjs/common';
import { CallFailureCode } from '../../calls/call.entity';
import {
  OrganizationQueueSettings,
  QueueBackoffStrategy,
} from '../organization-queue-settings.entity';
import { OrganizationQueueSettingsService } from '../organization-queue-settings.service';
import { QUEUE_DEFAULTS } from '../queue.defaults';

describe('OrganizationQueueSettingsService', () => {
  const ORG_ID = 'org-1';

  let repo: {
    findByOrganizationId: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    findEnabledAndNotPaused: jest.Mock;
    findAll: jest.Mock;
  };
  let organizationsService: { findById: jest.Mock };
  let config: { get: jest.Mock };
  let service: OrganizationQueueSettingsService;

  function makeSettings(
    overrides: Partial<OrganizationQueueSettings> = {},
  ): OrganizationQueueSettings {
    return {
      organizationId: ORG_ID,
      enabled: true,
      paused: false,
      maxConcurrent: QUEUE_DEFAULTS.maxConcurrent,
      maxDialsPerMinute: QUEUE_DEFAULTS.maxDialsPerMinute,
      defaultMaxAttempts: QUEUE_DEFAULTS.defaultMaxAttempts,
      backoffStrategy: QUEUE_DEFAULTS.backoffStrategy,
      backoffBaseSeconds: QUEUE_DEFAULTS.backoffBaseSeconds,
      backoffMaxSeconds: QUEUE_DEFAULTS.backoffMaxSeconds,
      retryOn: [...QUEUE_DEFAULTS.retryOn],
      quietHoursEnabled: false,
      quietHoursStart: null,
      quietHoursEnd: null,
      quietHoursTimezone: QUEUE_DEFAULTS.quietHoursTimezone,
      claimBatchSize: QUEUE_DEFAULTS.claimBatchSize,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      ...overrides,
    } as OrganizationQueueSettings;
  }

  beforeEach(() => {
    repo = {
      findByOrganizationId: jest.fn(),
      create: jest.fn((data) => ({ ...data }) as OrganizationQueueSettings),
      save: jest.fn(async (row: OrganizationQueueSettings) => ({ ...row })),
      findEnabledAndNotPaused: jest.fn(),
      findAll: jest.fn(),
    };
    organizationsService = {
      findById: jest.fn().mockResolvedValue({ id: ORG_ID }),
    };
    config = { get: jest.fn() };
    service = new OrganizationQueueSettingsService(
      repo as never,
      organizationsService as never,
      config as never,
    );
  });

  it('1. getOrCreate returns existing without create', async () => {
    const existing = makeSettings();
    repo.findByOrganizationId.mockResolvedValue(existing);
    const result = await service.getOrCreate(ORG_ID);
    expect(result).toBe(existing);
    expect(organizationsService.findById).toHaveBeenCalledWith(ORG_ID);
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('2. getOrCreate missing creates platform defaults', async () => {
    config.get.mockReturnValue(undefined);
    repo.findByOrganizationId.mockResolvedValue(null);
    repo.save.mockImplementation(async (row) => row);

    const result = await service.getOrCreate(ORG_ID);
    expect(organizationsService.findById).toHaveBeenCalledWith(ORG_ID);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        enabled: true,
        paused: false,
        maxConcurrent: QUEUE_DEFAULTS.maxConcurrent,
        maxDialsPerMinute: QUEUE_DEFAULTS.maxDialsPerMinute,
        defaultMaxAttempts: QUEUE_DEFAULTS.defaultMaxAttempts,
        backoffStrategy: QUEUE_DEFAULTS.backoffStrategy,
        claimBatchSize: QUEUE_DEFAULTS.claimBatchSize,
        quietHoursEnabled: false,
      }),
    );
    expect(result.organizationId).toBe(ORG_ID);
  });

  it('3. getOrCreate race: existing found after re-check returns it', async () => {
    const existing = makeSettings();
    repo.findByOrganizationId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    const result = await service.getOrCreate(ORG_ID);
    expect(result).toBe(existing);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('4. env QUEUE_DEFAULT_MAX_CONCURRENT=3 used on create', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'QUEUE_DEFAULT_MAX_CONCURRENT' ? '3' : undefined,
    );
    repo.findByOrganizationId.mockResolvedValue(null);
    await service.getOrCreate(ORG_ID);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ maxConcurrent: 3 }),
    );
  });

  it('5. invalid env falls back to QUEUE_DEFAULTS', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'QUEUE_DEFAULT_MAX_CONCURRENT') return '0';
      if (key === 'QUEUE_DEFAULT_MAX_DIALS_PER_MINUTE') return 'nope';
      if (key === 'QUEUE_DEFAULT_MAX_ATTEMPTS') return '';
      return undefined;
    });
    repo.findByOrganizationId.mockResolvedValue(null);
    await service.getOrCreate(ORG_ID);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        maxConcurrent: QUEUE_DEFAULTS.maxConcurrent,
        maxDialsPerMinute: QUEUE_DEFAULTS.maxDialsPerMinute,
        defaultMaxAttempts: QUEUE_DEFAULTS.defaultMaxAttempts,
      }),
    );
  });

  it('6. update applies only provided fields', async () => {
    const existing = makeSettings({
      maxConcurrent: 1,
      paused: false,
      retryOn: [CallFailureCode.NO_ANSWER],
    });
    repo.findByOrganizationId.mockResolvedValue(existing);

    const result = await service.update(ORG_ID, {
      maxConcurrent: 4,
      paused: true,
      backoffStrategy: QueueBackoffStrategy.FIXED,
      retryOn: [CallFailureCode.BUSY, CallFailureCode.TIMEOUT],
      quietHoursEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    });

    expect(result.maxConcurrent).toBe(4);
    expect(result.paused).toBe(true);
    expect(result.backoffStrategy).toBe(QueueBackoffStrategy.FIXED);
    expect(result.retryOn).toEqual([
      CallFailureCode.BUSY,
      CallFailureCode.TIMEOUT,
    ]);
    expect(result.quietHoursEnabled).toBe(true);
    expect(result.quietHoursStart).toBe('22:00');
    // Unchanged
    expect(result.maxDialsPerMinute).toBe(QUEUE_DEFAULTS.maxDialsPerMinute);
    expect(repo.save).toHaveBeenCalled();
  });

  it('7. setPaused true/false', async () => {
    const existing = makeSettings({ paused: false });
    repo.findByOrganizationId.mockResolvedValue(existing);

    let result = await service.setPaused(ORG_ID, true);
    expect(result.paused).toBe(true);

    existing.paused = true;
    result = await service.setPaused(ORG_ID, false);
    expect(result.paused).toBe(false);
  });

  it('8. getOrCreate propagates org not found', async () => {
    organizationsService.findById.mockRejectedValue(
      new NotFoundException('Organization not found'),
    );
    await expect(service.getOrCreate(ORG_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.findByOrganizationId).not.toHaveBeenCalled();
  });
});
