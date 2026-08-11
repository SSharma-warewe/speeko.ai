import { OrganizationQueueSettings } from '../organization-queue-settings.entity';
import { QueueSettingsResponseDto } from '../dto/queue-settings-response.dto';
import { CallFailureCode } from '../../calls/call.entity';

export function toQueueSettingsResponse(
  s: OrganizationQueueSettings,
): QueueSettingsResponseDto {
  return {
    organizationId: s.organizationId,
    enabled: s.enabled,
    paused: s.paused,
    maxConcurrent: s.maxConcurrent,
    maxDialsPerMinute: s.maxDialsPerMinute,
    defaultMaxAttempts: s.defaultMaxAttempts,
    backoffStrategy: s.backoffStrategy,
    backoffBaseSeconds: s.backoffBaseSeconds,
    backoffMaxSeconds: s.backoffMaxSeconds,
    retryOn: (s.retryOn ?? []) as CallFailureCode[],
    quietHoursEnabled: s.quietHoursEnabled,
    quietHoursStart: s.quietHoursStart,
    quietHoursEnd: s.quietHoursEnd,
    quietHoursTimezone: s.quietHoursTimezone,
    claimBatchSize: s.claimBatchSize,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
