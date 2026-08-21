import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class UserCostSummaryQueryDto {
  @ApiPropertyOptional({
    description: 'Inclusive start (ISO). Default: 30 days before `to`.',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Exclusive end (ISO). Default: now.',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class CostSummaryQueryDto extends UserCostSummaryQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class CostSummaryByKeyDto {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  amountUsd!: number;
}

export class CostSummaryDailyDto {
  @ApiProperty({ example: '2026-08-02' })
  date!: string;

  @ApiProperty()
  callCount!: number;

  @ApiProperty()
  totalUsd!: number;
}

export class CostSummaryResponseDto {
  @ApiProperty({ example: 'USD' })
  currency!: 'USD';

  @ApiProperty({ example: 0 })
  markup!: 0;

  @ApiProperty({ enum: ['build', 'ship', 'scale'] })
  plan!: string;

  @ApiProperty()
  catalogAsOf!: string;

  @ApiProperty()
  from!: string;

  @ApiProperty()
  to!: string;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  organizationId!: string | null;

  @ApiProperty({ description: 'Calls in range that have cost_usd' })
  callCount!: number;

  @ApiProperty({ description: 'Calls in range with no cost snapshot yet' })
  unpricedCount!: number;

  @ApiProperty()
  totalUsd!: number;

  @ApiProperty()
  avgUsd!: number;

  @ApiProperty()
  billedMinutes!: number;

  @ApiProperty({ type: [CostSummaryByKeyDto] })
  byKey!: CostSummaryByKeyDto[];

  @ApiProperty({ type: [CostSummaryDailyDto] })
  daily!: CostSummaryDailyDto[];
}

export class CostRecomputeDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  callId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description:
      'When true, overwrite existing snapshots (single attempt from current usage). Default false = only unpriced rows.',
  })
  @IsOptional()
  @IsBoolean()
  replace?: boolean;

  @ApiPropertyOptional({ default: 500, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class CostRecomputeResponseDto {
  @ApiProperty()
  priced!: number;

  @ApiProperty()
  skipped!: number;
}
