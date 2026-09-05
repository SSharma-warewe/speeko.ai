import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IntegrationEndpointResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ example: 'HubSpot leads' })
  name!: string;

  @ApiProperty({
    example: 'x7k9m2pQabc1',
    description: 'Opaque public path segment',
  })
  publicId!: string;

  @ApiProperty({ format: 'uuid' })
  organizationAgentId!: string;

  @ApiProperty({ example: 'demo_booking' })
  taskKey!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  sipTrunkId!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  maxAttempts!: number | null;

  @ApiProperty({ example: 0 })
  priority!: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  maxConcurrent!: number | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  defaultContext!: Record<string, unknown> | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ example: 'ca_live_ab12cd', description: 'Key prefix for display only' })
  keyPrefix!: string;

  @ApiProperty({
    example: '/api/integrations/x7k9m2pQabc1/calls',
    description: 'Relative path for CRM POST (prefix with your API base URL)',
  })
  endpointPath!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastUsedAt!: Date | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

/** Create / rotate response: includes full apiKey once. */
export class IntegrationEndpointSecretResponseDto extends IntegrationEndpointResponseDto {
  @ApiProperty({
    example: 'ca_live_…',
    description: 'Full API key — shown only once on create or rotate. Store securely.',
  })
  apiKey!: string;
}
