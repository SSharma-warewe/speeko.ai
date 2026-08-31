import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { DELIVERY_MODES } from '../voice-settings';

export class UpdateAgentDto {
  @ApiPropertyOptional({
    description:
      'Persona system prompt only (identity, tone, policies). No workflow steps.',
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

  @ApiPropertyOptional({ example: 'general' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  defaultTaskKey?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  defaultToolProfileId?: string;

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

  @ApiPropertyOptional({
    nullable: true,
    description:
      'TTS catalog id (inworld/inworld-tts-2, fishaudio/s2.1-pro-free, google/gemini-3.1-flash-tts-preview). null = worker default Inworld. OpenRouter Fish slug is accepted and stored as the LiveKit id.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ttsModel?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Inworld TTS speaking_rate. 0.5–1.5. null = provider default.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1.5)
  speakingRate?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    enum: DELIVERY_MODES,
    description: 'Inworld TTS-2 delivery_mode. null = BALANCED.',
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
