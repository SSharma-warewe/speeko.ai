import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateOrganizationIntegrationDto {
  @ApiPropertyOptional({ example: 'Clinic Google Calendar' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    description: 'Replace the stored API key / PIT. Omitted = keep existing.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  apiKey?: string;

  @ApiPropertyOptional({
    description: 'Nylas grant id. Ignored for GoHighLevel.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  grantId?: string;

  @ApiPropertyOptional({
    description: 'GoHighLevel location id. Ignored for Nylas.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  calendarId?: string;

  @ApiPropertyOptional({ example: 'https://api.us.nylas.com' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(255)
  apiUri?: string;

  @ApiPropertyOptional({ example: 'clinic@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
