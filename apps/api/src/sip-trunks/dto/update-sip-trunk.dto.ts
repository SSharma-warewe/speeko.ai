import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Local update for an **outbound** SIP trunk.
 * Does not re-sync LiveKit. Never accept direction/livekitTrunkId changes here.
 * Shared by admin and org-user outbound endpoints.
 */
export class UpdateSipTrunkDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Caller ID / trunk numbers (E.164 preferred). At least one if provided.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  numbers?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  authUsername?: string;

  @ApiPropertyOptional({ description: 'Never returned in responses' })
  @IsOptional()
  @IsString()
  authPassword?: string;
}
