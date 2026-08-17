import { OrganizationIntegration } from '../organization-integration.entity';
import { OrganizationIntegrationResponseDto } from '../dto/organization-integration-response.dto';

/** Map entity → response; never include apiKey. */
export function toOrganizationIntegrationResponse(
  row: OrganizationIntegration,
): OrganizationIntegrationResponseDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    provider: row.provider,
    name: row.name,
    apiKeyPrefix: row.apiKeyPrefix,
    grantId: row.grantId ?? null,
    locationId: row.locationId ?? null,
    calendarId: row.calendarId,
    apiUri: row.apiUri,
    email: row.email,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function apiKeyPrefixFrom(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return trimmed.slice(0, 4) + '…';
  return trimmed.slice(0, 8) + '…';
}
