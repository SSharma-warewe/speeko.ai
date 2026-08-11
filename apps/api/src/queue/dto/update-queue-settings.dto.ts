import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CallFailureCode } from '../../calls/call.entity';
import { QueueBackoffStrategy } from '../organization-queue-settings.entity';

const FAILURE_CODES = Object.values(CallFailureCode);

export class UpdateQueueSettingsDto {
  @ApiPropertyOptional({ description: 'Master switch for org dial queue' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Soft-pause: no new claims' })
  @IsOptional()
  @IsBoolean()
  paused?: boolean;

  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    maximum: 100,
    description:
      'Max simultaneous in-flight SIP legs (creating/dialing/ready). Match your SIP trunk channel limit.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxConcurrent?: number;

  @ApiPropertyOptional({
    example: 30,
    minimum: 1,
    maximum: 600,
    description: 'Max dial starts per rolling minute',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  maxDialsPerMinute?: number;

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  defaultMaxAttempts?: number;

  @ApiPropertyOptional({ enum: QueueBackoffStrategy })
  @IsOptional()
  @IsEnum(QueueBackoffStrategy)
  backoffStrategy?: QueueBackoffStrategy;

  @ApiPropertyOptional({ example: 60, minimum: 1, maximum: 86400 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  backoffBaseSeconds?: number;

  @ApiPropertyOptional({ example: 3600, minimum: 1, maximum: 86400 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  backoffMaxSeconds?: number;

  @ApiPropertyOptional({
    type: [String],
    enum: FAILURE_CODES,
    isArray: true,
    description: 'Failure codes that requeue when attempts remain',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(FAILURE_CODES, { each: true })
  retryOn?: CallFailureCode[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  quietHoursEnabled?: boolean;

  @ApiPropertyOptional({
    example: '21:00',
    description: 'Local quiet-hours start HH:mm',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  quietHoursStart?: string | null;

  @ApiPropertyOptional({
    example: '08:00',
    description: 'Local quiet-hours end HH:mm',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  quietHoursEnd?: string | null;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  quietHoursTimezone?: string;

  @ApiPropertyOptional({
    example: 5,
    minimum: 1,
    maximum: 50,
    description: 'Max claims per dialer tick for this org',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  claimBatchSize?: number;
}
