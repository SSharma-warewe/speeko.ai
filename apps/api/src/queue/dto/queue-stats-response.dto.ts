import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QueueStatsQueueDto {
  @ApiProperty()
  enabled!: boolean;

  @ApiProperty()
  paused!: boolean;

  @ApiProperty()
  maxConcurrent!: number;

  @ApiProperty()
  maxDialsPerMinute!: number;

  @ApiProperty()
  inProgress!: number;

  @ApiProperty()
  availableSlots!: number;

  @ApiProperty()
  dialsLastMinute!: number;
}

export class QueueStatsDailyDto {
  @ApiProperty({ example: '2026-08-02', description: 'UTC calendar day (YYYY-MM-DD)' })
  date!: string;

  @ApiProperty({ description: 'Calls created that day' })
  total!: number;

  @ApiProperty()
  completed!: number;

  @ApiProperty()
  failed!: number;

  @ApiProperty()
  cancelled!: number;
}

export class QueueStatsCountsDto {
  @ApiProperty()
  pending!: number;

  @ApiProperty({ description: 'Pending and eligible to claim now' })
  pendingReadyNow!: number;

  @ApiProperty()
  creating!: number;

  @ApiProperty()
  dialing!: number;

  @ApiProperty()
  ready!: number;

  @ApiProperty()
  completed!: number;

  @ApiProperty()
  failed!: number;

  @ApiProperty()
  cancelled!: number;
}

export class QueueStatsRetriesDto {
  @ApiProperty({ description: 'Pending with future next_attempt_at' })
  scheduled!: number;

  @ApiProperty()
  avgAttemptCount!: number;
}

export class QueueStatsBatchesDto {
  @ApiProperty()
  running!: number;

  @ApiProperty()
  paused!: number;
}

export class QueueDialerHealthDto {
  @ApiProperty()
  globalEnabled!: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastTickAt!: Date | null;

  @ApiProperty()
  lastClaimCount!: number;

  @ApiPropertyOptional({ nullable: true })
  lastError!: string | null;
}

export class OrgQueueStatsResponseDto {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ type: QueueStatsQueueDto })
  queue!: QueueStatsQueueDto;

  @ApiProperty({ type: QueueStatsCountsDto })
  counts!: QueueStatsCountsDto;

  @ApiProperty({ type: QueueStatsRetriesDto })
  retries!: QueueStatsRetriesDto;

  @ApiProperty({ type: QueueStatsBatchesDto })
  batches!: QueueStatsBatchesDto;

  @ApiProperty({ type: QueueDialerHealthDto })
  dialer!: QueueDialerHealthDto;

  @ApiProperty({
    type: [QueueStatsDailyDto],
    description: 'Last 14 UTC days of call volume (zeros filled)',
  })
  daily!: QueueStatsDailyDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  asOf!: Date;
}

export class AdminQueueTotalsDto {
  @ApiProperty()
  pending!: number;

  @ApiProperty()
  inProgress!: number;

  @ApiProperty()
  completed!: number;

  @ApiProperty()
  failed!: number;

  @ApiProperty()
  cancelled!: number;

  @ApiProperty()
  orgsEnabled!: number;

  @ApiProperty()
  orgsPaused!: number;
}

export class AdminQueueStatsResponseDto {
  @ApiProperty({ type: AdminQueueTotalsDto })
  totals!: AdminQueueTotalsDto;

  @ApiProperty({ type: QueueDialerHealthDto })
  dialer!: QueueDialerHealthDto;

  @ApiProperty({ type: [OrgQueueStatsResponseDto] })
  organizations!: OrgQueueStatsResponseDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  asOf!: Date;
}
