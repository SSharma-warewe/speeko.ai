import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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
      'LiveKit onExit instructions. null = default; empty string = silent end.',
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

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
