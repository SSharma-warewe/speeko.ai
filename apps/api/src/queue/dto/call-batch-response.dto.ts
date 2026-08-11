import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CallBatchStatus } from '../call-batch.entity';

export class CallBatchStatsDto {
  @ApiProperty({ example: 10 })
  pending!: number;

  @ApiProperty({ example: 1 })
  creating!: number;

  @ApiProperty({ example: 1 })
  dialing!: number;

  @ApiProperty({ example: 0 })
  ready!: number;

  @ApiProperty({ example: 5 })
  completed!: number;

  @ApiProperty({ example: 1 })
  failed!: number;

  @ApiProperty({ example: 0 })
  cancelled!: number;
}

export class CallBatchResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ enum: CallBatchStatus })
  status!: CallBatchStatus;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  organizationAgentId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  sipTrunkId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  taskKey!: string | null;

  @ApiPropertyOptional({ nullable: true })
  maxAttempts!: number | null;

  @ApiPropertyOptional({ nullable: true })
  maxConcurrent!: number | null;

  @ApiProperty({ example: 0 })
  priority!: number;

  @ApiProperty({ example: 10 })
  totalCount!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  pausedAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiPropertyOptional({ type: CallBatchStatsDto })
  stats?: CallBatchStatsDto;
}
