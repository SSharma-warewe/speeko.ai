import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CallFailureCode } from '../../calls/call.entity';
import { QueueBackoffStrategy } from '../organization-queue-settings.entity';

export class QueueSettingsResponseDto {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty()
  enabled!: boolean;

  @ApiProperty()
  paused!: boolean;

  @ApiProperty({ example: 5 })
  maxConcurrent!: number;

  @ApiProperty({ example: 30 })
  maxDialsPerMinute!: number;

  @ApiProperty({ example: 3 })
  defaultMaxAttempts!: number;

  @ApiProperty({ enum: QueueBackoffStrategy })
  backoffStrategy!: QueueBackoffStrategy;

  @ApiProperty({ example: 60 })
  backoffBaseSeconds!: number;

  @ApiProperty({ example: 3600 })
  backoffMaxSeconds!: number;

  @ApiProperty({
    type: [String],
    enum: CallFailureCode,
    isArray: true,
  })
  retryOn!: CallFailureCode[];

  @ApiProperty()
  quietHoursEnabled!: boolean;

  @ApiPropertyOptional({ nullable: true, example: '21:00' })
  quietHoursStart!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '08:00' })
  quietHoursEnd!: string | null;

  @ApiProperty({ example: 'UTC' })
  quietHoursTimezone!: string;

  @ApiProperty({ example: 5 })
  claimBatchSize!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
