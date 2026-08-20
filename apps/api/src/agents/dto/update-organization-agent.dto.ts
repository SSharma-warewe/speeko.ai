import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { DELIVERY_MODES } from '../voice-settings';

export class UpdateOrganizationAgentDto {
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
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
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
    example: 'confirm_appointment',
    description: 'Default LiveKit task key when outbound call omits task',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  defaultTaskKey?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  voice?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Inworld TTS speaking_rate. 0.5–1.5. null = template / default.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1.5)
  speakingRate?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    enum: DELIVERY_MODES,
    description: 'Inworld TTS-2 delivery_mode. null = template / BALANCED.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsIn(DELIVERY_MODES)
  deliveryMode?: (typeof DELIVERY_MODES)[number] | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
