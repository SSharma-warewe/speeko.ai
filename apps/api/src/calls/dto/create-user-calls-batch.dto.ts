import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateUserCallItemDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: {
      phoneNumber: '+919876543210',
      customerName: 'Ada',
      bookingId: 'bk_123',
    },
    description:
      'Runtime context for the task. phoneNumber is used when toNumber is omitted.',
  })
  @IsObject()
  context!: Record<string, unknown>;

  @ApiPropertyOptional({
    example: '+919876543210',
    description: 'Destination number (E.164 preferred). Overrides context.phoneNumber.',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  toNumber?: string;
}

/**
 * Bulk enqueue 1–50 pending outbound SIP calls (no dial yet).
 * Organization is taken from the JWT.
 */
export class CreateUserCallsBatchDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Organization-owned agent instance to use for every call in the batch',
  })
  @IsUUID()
  organizationAgentId!: string;

  @ApiProperty({
    type: [CreateUserCallItemDto],
    description: 'Call destinations (1–50). Each becomes a pending call row.',
    minItems: 1,
    maxItems: 50,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateUserCallItemDto)
  calls!: CreateUserCallItemDto[];

  @ApiPropertyOptional({
    example: 'confirm_appointment',
    description:
      'LiveKit task key for all items. Defaults to the organization agent default task.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  task?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Local sip_trunks row id. Defaults to the org first active outbound trunk.',
  })
  @IsOptional()
  @IsUUID()
  sipTrunkId?: string;

  @ApiPropertyOptional({
    type: Number,
    example: 3,
    minimum: 1,
    maximum: 20,
    description:
      'Max dial attempts per call. Defaults to org queue settings defaultMaxAttempts.',
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
    description: 'Batch/call priority (higher claimed first). Default 0.',
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
    description:
      'Optional batch concurrency cap (further limited by org maxConcurrent).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxConcurrent?: number;
}
