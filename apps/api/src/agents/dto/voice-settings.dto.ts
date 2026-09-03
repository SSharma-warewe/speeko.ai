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
    description:
      'LLM / realtime catalog id (google/gemma-4-31b-it, openai/gpt-4.1-mini, xai/grok-4.6, openai/gpt-realtime-2.1, xai/grok-voice-think-fast-2.0). null = Gemma via LiveKit Inference. Realtime ids run speech-to-speech (no STT/TTS).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'TTS catalog id (inworld/inworld-tts-2, fishaudio/s2.1-pro-free, openai/gpt-4o-mini-tts, xai/tts-1). null = worker / template default (Inworld). Ignored when model is a realtime id.',
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
