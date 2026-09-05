import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SLUG_PATTERN } from '../../common/slug';
import { VoiceSettingsDto } from './voice-settings.dto';

export class UpdateOrganizationAgentDto extends VoiceSettingsDto {
  @ApiPropertyOptional({
    example: 'Booking confirmations',
    description: 'Display name for this org agent config',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    example: 'booking-confirmations',
    description:
      'Unique-per-org slug. Letters, numbers, hyphens. Changing slug does not update call history.',
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
    description:
      'Org-specific persona prompt (identity, tone, policies). Not workflow instructions.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  systemPrompt?: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'LiveKit onEnter instructions. null = default; empty string = silent start.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  onEnterInstructions?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Spoken closing line for onExit (session.say). null = default; empty string = silent end.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  onExitInstructions?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Tool profile that selects which worker tools are enabled',
  })
  @IsOptional()
  @IsUUID()
  toolProfileId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Organization Nylas calendar integration for calendar tools. null clears the link. Must belong to the same org.',
  })
  @IsOptional()
  @IsUUID()
  calendarIntegrationId?: string | null;

  @ApiPropertyOptional({
    example: 'interview_booking',
    nullable: true,
    description:
      'Inbound only: default LiveKit task (cannot clear). Outbound: omit — 400 if sent.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  defaultTaskKey?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
