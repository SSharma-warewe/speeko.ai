import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgentDirection } from '../../agents/agent.entity';
import { CallCostSnapshotDto } from '../../price/dto/call-cost.dto';
import { CallMedium, CallStatus, CallTaskStatus } from '../call.entity';

export class CallResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  organizationId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  organizationAgentId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  agentId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  sipTrunkId!: string | null;

  @ApiProperty({ enum: AgentDirection, example: AgentDirection.INBOUND })
  direction!: AgentDirection;

  @ApiProperty({ enum: CallStatus, example: CallStatus.READY })
  status!: CallStatus;

  @ApiProperty({ enum: CallMedium, example: CallMedium.WEB })
  medium!: CallMedium;

  @ApiPropertyOptional({
    example: 'test-inbound-a1b2c3d4',
    nullable: true,
    description: 'Null while status is pending (not dialed yet)',
  })
  roomName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  livekitDispatchId!: string | null;

  @ApiPropertyOptional({ example: 'call-agent', nullable: true })
  livekitAgentName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  livekitSipCallId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  participantIdentity!: string | null;

  @ApiPropertyOptional({ nullable: true })
  fromNumber!: string | null;

  @ApiPropertyOptional({ nullable: true })
  toNumber!: string | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  context!: Record<string, unknown> | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'confirm_appointment',
    description: 'LiveKit task key dispatched to the worker',
  })
  taskKey!: string | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Structured task result from the worker',
  })
  taskResult!: Record<string, unknown> | null;

  @ApiProperty({
    enum: CallTaskStatus,
    example: CallTaskStatus.PENDING,
    description:
      'Workflow flag: pending until the session ends; completed only if complete_* ran',
  })
  taskStatus!: CallTaskStatus;

  @ApiPropertyOptional({ type: 'array', nullable: true })
  transcript!: Array<{
    role: string;
    content: string;
    createdAt?: string | number | null;
    id?: string;
  }> | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  usage!: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  sessionReport!: Record<string, unknown> | null;

  @ApiPropertyOptional({
    type: CallCostSnapshotDto,
    nullable: true,
    description:
      'LiveKit list-price cost (no markup). Null until the worker completes an attempt.',
  })
  cost?: CallCostSnapshotDto | null;

  @ApiPropertyOptional({
    type: 'array',
    nullable: true,
    description:
      'Worker tool invocations for this call (derived from sessionReport.toolEvents). Includes args, result, ok, duration.',
    items: {
      type: 'object',
      properties: {
        at: { type: 'string' },
        toolId: { type: 'string' },
        ok: { type: 'boolean' },
        error: { type: 'string' },
        summary: { type: 'string' },
        durationMs: { type: 'number' },
        args: {},
        result: {},
      },
    },
  })
  toolEvents!: Array<Record<string, unknown>> | null;

  @ApiPropertyOptional({ nullable: true })
  errorMessage!: string | null;

  @ApiProperty({ example: 0, description: 'Dial attempts so far' })
  attemptCount!: number;

  @ApiProperty({ example: 3, description: 'Max dial attempts before giving up' })
  maxAttempts!: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When eligible for next dial attempt (queue claim)',
  })
  nextAttemptAt!: Date | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Shared id for bulk-enqueued calls (call_batches.id)',
  })
  batchId!: string | null;

  @ApiProperty({ example: 0, description: 'Queue priority (higher first)' })
  priority!: number;

  @ApiPropertyOptional({
    nullable: true,
    example: 'no_answer',
    description: 'Last classified failure code',
  })
  lastFailureCode!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastFailureAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  dialStartedAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  queueLockedAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  startedAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  answeredAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  endedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

/** Bulk enqueue response: shared batch id + created pending rows. */
export class EnqueueCallsResponseDto {
  @ApiProperty({ format: 'uuid' })
  batchId!: string;

  @ApiProperty({ example: 5 })
  count!: number;

  @ApiProperty({ type: [CallResponseDto] })
  calls!: CallResponseDto[];
}

/** Web test response: call record + LiveKit join credentials. */
export class TestCallResponseDto extends CallResponseDto {
  @ApiProperty({ example: 'inbound' })
  agentKey!: string;

  @ApiProperty({ example: 'wss://your-project.livekit.cloud' })
  livekitUrl!: string;

  @ApiProperty({ description: 'Participant JWT for the tester to join the room' })
  participantToken!: string;

  @ApiProperty({
    description: 'Open in browser to talk to the agent (LiveKit Meet custom room)',
  })
  meetUrl!: string;
}
