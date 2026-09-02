import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { VoiceSettingsDto } from './voice-settings.dto';

export class UpdateAgentDto extends VoiceSettingsDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
