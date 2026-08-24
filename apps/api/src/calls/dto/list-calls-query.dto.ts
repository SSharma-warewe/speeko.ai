import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { AgentDirection } from '../../agents/agent.entity';
import { CallBucket, CallStatus } from '../call.entity';

export class ListCallsQueryDto {
  @ApiPropertyOptional({ type: Number, example: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({
    enum: CallBucket,
    description:
      'High-level lifecycle bucket. Ignored when status is set. ' +
      'pending = queued; in_progress = creating/dialing/ready; done = completed/incomplete/failed/cancelled.',
  })
  @IsOptional()
  @IsEnum(CallBucket)
  bucket?: CallBucket;

  @ApiPropertyOptional({
    enum: CallStatus,
    description: 'Exact status filter. Takes precedence over bucket when both are set.',
  })
  @IsOptional()
  @IsEnum(CallStatus)
  status?: CallStatus;

  @ApiPropertyOptional({
    enum: AgentDirection,
    description:
      'Filter by call direction (inbound | outbound). SIP inbound rings appear after the worker upserts the call on job start.',
  })
  @IsOptional()
  @IsEnum(AgentDirection)
  direction?: AgentDirection;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filter by bulk enqueue batch id',
  })
  @IsOptional()
  @IsUUID()
  batchId?: string;
}
