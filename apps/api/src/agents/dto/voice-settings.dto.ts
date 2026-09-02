import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { DELIVERY_MODES } from '../voice-settings';

/** Shared TTS/LLM override fields on platform templates and org agent configs. */
export class VoiceSettingsDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  voice?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'LLM override (LiveKit Inference). Not the speech model.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'TTS catalog id (inworld/inworld-tts-2, fishaudio/s2.1-pro-free, google/gemini-3.1-flash-tts-preview). null = worker / template default (Inworld). OpenRouter Fish slug is accepted and stored as the LiveKit id.',
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
}
