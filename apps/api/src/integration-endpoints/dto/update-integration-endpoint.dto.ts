import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateIntegrationEndpointDto {
  @ApiPropertyOptional({ example: 'HubSpot leads' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  organizationAgentId?: string;

  @ApiPropertyOptional({ example: 'lead_qualification' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  task?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Set null to clear and use org default outbound trunk.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  sipTrunkId?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 20, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxConcurrent?: number | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  defaultContext?: Record<string, unknown> | null;

  @ApiPropertyOptional({ description: 'Soft-disable without deleting' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
