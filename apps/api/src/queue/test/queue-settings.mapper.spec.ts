import { CallFailureCode } from '../../calls/call.entity';
import {
  OrganizationQueueSettings,
  QueueBackoffStrategy,
} from '../organization-queue-settings.entity';
import { toQueueSettingsResponse } from '../mappers/queue-settings.mapper';

describe('toQueueSettingsResponse', () => {
  it('1. maps settings fields 1:1', () => {
    const s = {
      organizationId: 'org-1',
      enabled: true,
      paused: false,
      maxConcurrent: 5,
      maxDialsPerMinute: 30,
      defaultMaxAttempts: 3,
      backoffStrategy: QueueBackoffStrategy.EXPONENTIAL,
      backoffBaseSeconds: 60,
      backoffMaxSeconds: 3600,
      retryOn: [CallFailureCode.NO_ANSWER, CallFailureCode.BUSY],
      quietHoursEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      quietHoursTimezone: 'America/New_York',
      claimBatchSize: 2,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    } as OrganizationQueueSettings;

    expect(toQueueSettingsResponse(s)).toEqual({
      organizationId: 'org-1',
      enabled: true,
      paused: false,
      maxConcurrent: 5,
      maxDialsPerMinute: 30,
      defaultMaxAttempts: 3,
      backoffStrategy: QueueBackoffStrategy.EXPONENTIAL,
      backoffBaseSeconds: 60,
      backoffMaxSeconds: 3600,
      retryOn: [CallFailureCode.NO_ANSWER, CallFailureCode.BUSY],
      quietHoursEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      quietHoursTimezone: 'America/New_York',
      claimBatchSize: 2,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    });
  });

  it('2. retryOn null/undefined becomes empty array', () => {
    const s = {
      organizationId: 'org-1',
      enabled: true,
      paused: false,
      maxConcurrent: 1,
      maxDialsPerMinute: 30,
      defaultMaxAttempts: 3,
      backoffStrategy: QueueBackoffStrategy.FIXED,
      backoffBaseSeconds: 60,
      backoffMaxSeconds: 3600,
      retryOn: null,
      quietHoursEnabled: false,
      quietHoursStart: null,
      quietHoursEnd: null,
      quietHoursTimezone: 'UTC',
      claimBatchSize: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as OrganizationQueueSettings;

    expect(toQueueSettingsResponse(s).retryOn).toEqual([]);
  });
});
