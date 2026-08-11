import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IntegrationProvider } from '../organization-integration.entity';

export class CreateOrganizationIntegrationDto {
  @ApiProperty({ example: 'Clinic Google Calendar' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    enum: IntegrationProvider,
    default: IntegrationProvider.NYLAS,
    description: 'Provider type. Only nylas is supported in v1.',
  })
  @IsOptional()
  @IsEnum(IntegrationProvider)
  provider?: IntegrationProvider;

  @ApiProperty({
    description: 'Nylas API key from the Nylas dashboard. Stored server-side; never returned on GET.',
    example: 'nyk_…',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  apiKey!: string;

  @ApiProperty({
    description: 'Nylas grant id for the connected Google/Microsoft account',
    example: '1e3288f6-124e-405d-a13a-635a2ee54eb2',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  grantId!: string;

  @ApiPropertyOptional({
    default: 'primary',
    description: 'Calendar id within the grant (usually "primary")',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  calendarId?: string;

  @ApiPropertyOptional({
    default: 'https://api.us.nylas.com',
    description: 'Nylas API base URI (US or EU)',
    example: 'https://api.us.nylas.com',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(255)
  apiUri?: string;

  @ApiPropertyOptional({
    description:
      'Email for the connected calendar account. Required for free/busy checks.',
    example: 'clinic@example.com',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;
}
