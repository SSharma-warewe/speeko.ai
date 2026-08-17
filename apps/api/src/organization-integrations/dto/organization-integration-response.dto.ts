import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IntegrationProvider } from '../organization-integration.entity';

/** Safe response — never includes apiKey. */
export class OrganizationIntegrationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ enum: IntegrationProvider })
  provider!: IntegrationProvider;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    description: 'Display prefix of the stored API key (secret never returned)',
  })
  apiKeyPrefix!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Nylas grant id. Null for GoHighLevel.',
  })
  grantId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'GoHighLevel location id. Null for Nylas.',
  })
  locationId!: string | null;

  @ApiProperty()
  calendarId!: string;

  @ApiProperty()
  apiUri!: string;

  @ApiPropertyOptional({ nullable: true })
  email!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class OrganizationIntegrationTestResponseDto {
  @ApiProperty()
  ok!: boolean;

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional({ type: [String] })
  calendarIds?: string[];
}
