import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateIntegrationEndpointDto {
  @ApiProperty({
    example: 'HubSpot leads',
    description: 'Human label for this CRM / integration endpoint',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Organization agent used for every call through this endpoint',
  })
  @IsUUID()
  organizationAgentId!: string;

  @ApiPropertyOptional({
    example: 'confirm_appointment',
    description:
      'LiveKit task key. Defaults to the platform template task (`general` if unset). Outbound agents have no default task.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  task?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Outbound SIP trunk. Defaults to the org first active outbound trunk at enqueue time.',
  })
  @IsOptional()
  @IsUUID()
  sipTrunkId?: string;

  @ApiPropertyOptional({
    type: Number,
    example: 3,
    minimum: 1,
    maximum: 20,
    description: 'Max dial attempts per call. Defaults to org queue settings.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts?: number;

  @ApiPropertyOptional({
    type: Number,
    example: 0,
    description: 'Call priority (higher claimed first). Default 0.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @ApiPropertyOptional({
    type: Number,
    example: 2,
    minimum: 1,
    maximum: 100,
    description: 'Optional batch concurrency cap for calls from this endpoint.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxConcurrent?: number;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { clinicName: 'Ada Clinic', source: 'hubspot' },
    description:
      'Static context merged under each request. Request context wins on key conflicts.',
  })
  @IsOptional()
  @IsObject()
  defaultContext?: Record<string, unknown>;
}
