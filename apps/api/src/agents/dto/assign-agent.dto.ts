import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { SLUG_PATTERN } from '../../common/slug';

export class AssignAgentDto {
  @ApiProperty({
    description: 'Platform agent template id to create an org config from',
    format: 'uuid',
  })
  @IsUUID()
  agentId!: string;

  @ApiPropertyOptional({
    example: 'Booking confirmations',
    description:
      'Display name for this org agent config. Defaults to the template name. Multiple configs may share the same template.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    example: 'booking-confirmations',
    description:
      'Unique-per-org slug. Defaults from name (or template key). Letters, numbers, hyphens.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(SLUG_PATTERN, {
    message:
      'slug must be lowercase alphanumeric with optional single hyphens (e.g. booking-confirmations)',
  })
  slug?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Tool profile for this org agent. Defaults to the template default profile.',
  })
  @IsOptional()
  @IsUUID()
  toolProfileId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Optional Nylas calendar integration for this agent (same org).',
  })
  @IsOptional()
  @IsUUID()
  calendarIntegrationId?: string;

  @ApiPropertyOptional({
    example: 'interview_booking',
    description:
      'Inbound only: default LiveKit task (required). Outbound: omit — 400 if sent.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  defaultTaskKey?: string;
}
