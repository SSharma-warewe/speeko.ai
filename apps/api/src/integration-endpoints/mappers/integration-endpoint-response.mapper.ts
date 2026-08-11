import { IntegrationEndpoint } from '../integration-endpoint.entity';
import {
  IntegrationEndpointResponseDto,
  IntegrationEndpointSecretResponseDto,
} from '../dto/integration-endpoint-response.dto';

export function endpointPathFor(publicId: string): string {
  return `/api/integrations/${publicId}/calls`;
}

export function toIntegrationEndpointResponse(
  row: IntegrationEndpoint,
): IntegrationEndpointResponseDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    publicId: row.publicId,
    organizationAgentId: row.organizationAgentId,
    taskKey: row.taskKey,
    sipTrunkId: row.sipTrunkId,
    maxAttempts: row.maxAttempts,
    priority: row.priority,
    maxConcurrent: row.maxConcurrent,
    defaultContext: row.defaultContext,
    isActive: row.isActive,
    keyPrefix: row.keyPrefix,
    endpointPath: endpointPathFor(row.publicId),
    lastUsedAt: row.lastUsedAt,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toIntegrationEndpointSecretResponse(
  row: IntegrationEndpoint,
  apiKey: string,
): IntegrationEndpointSecretResponseDto {
  return {
    ...toIntegrationEndpointResponse(row),
    apiKey,
  };
}
