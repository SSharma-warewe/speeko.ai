import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Agent, AgentDirection } from '../agents/agent.entity';
import { OrganizationAgent } from '../agents/organization-agent.entity';
import { Organization } from '../organizations/organization.entity';
import type { CallCostSnapshot } from '../price/price.types';
import { SipTrunk } from '../sip-trunks/sip-trunk.entity';

/**
 * Detailed call lifecycle. Buckets for listing:
 * - pending: PENDING
 * - in_progress: CREATING | DIALING | READY
 * - done: COMPLETED | INCOMPLETE | FAILED | CANCELLED
 *
 * `completed` = session ended AND the LiveKit task called complete_*.
 * `incomplete` = live conversation ended without task.complete().
 * `failed` = never had a successful conversation (no answer / SIP / timeout).
 */
export enum CallStatus {
  PENDING = 'pending',
  CREATING = 'creating',
  DIALING = 'dialing',
  READY = 'ready',
  FAILED = 'failed',
  COMPLETED = 'completed',
  INCOMPLETE = 'incomplete',
  CANCELLED = 'cancelled',
}

/** Workflow flag — do not infer from task_result JSON. */
export enum CallTaskStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  INCOMPLETE = 'incomplete',
}

export enum CallBucket {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
}

export const CALL_BUCKET_STATUSES: Record<CallBucket, CallStatus[]> = {
  [CallBucket.PENDING]: [CallStatus.PENDING],
  [CallBucket.IN_PROGRESS]: [
    CallStatus.CREATING,
    CallStatus.DIALING,
    CallStatus.READY,
  ],
  [CallBucket.DONE]: [
    CallStatus.COMPLETED,
    CallStatus.INCOMPLETE,
    CallStatus.FAILED,
    CallStatus.CANCELLED,
  ],
};

export enum CallMedium {
  WEB = 'web',
  SIP = 'sip',
}

/** Dial / session failure classification for queue retry policy. */
export enum CallFailureCode {
  NO_ANSWER = 'no_answer',
  BUSY = 'busy',
  SIP_ERROR = 'sip_error',
  TIMEOUT = 'timeout',
  AGENT_ERROR = 'agent_error',
  CANCELLED = 'cancelled',
  UNKNOWN = 'unknown',
}

export const DEFAULT_RETRY_ON: CallFailureCode[] = [
  CallFailureCode.NO_ANSWER,
  CallFailureCode.BUSY,
  CallFailureCode.TIMEOUT,
  CallFailureCode.SIP_ERROR,
];

export type CallTranscriptItem = {
  role: string;
  content: string;
  createdAt?: string | number | null;
  id?: string;
};

export type CallUsageSnapshot = {
  models?: unknown[];
  [key: string]: unknown;
};

@Entity({ name: 'calls' })
@Index('idx_calls_organization_id', ['organizationId'])
@Index('idx_calls_agent_id', ['agentId'])
@Index('idx_calls_status', ['status'])
@Index('idx_calls_created_at', ['createdAt'])
@Index('idx_calls_batch_id', ['batchId'])
@Index('idx_calls_org_status_next', ['organizationId', 'status', 'nextAttemptAt'])
@Index('idx_calls_dial_started_at', ['dialStartedAt'])
export class Call {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization | null;

  @Column({ name: 'organization_agent_id', type: 'uuid', nullable: true })
  organizationAgentId!: string | null;

  @ManyToOne(() => OrganizationAgent, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'organization_agent_id' })
  organizationAgent!: OrganizationAgent | null;

  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId!: string | null;

  @ManyToOne(() => Agent, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agent_id' })
  agent!: Agent | null;

  @Column({ name: 'sip_trunk_id', type: 'uuid', nullable: true })
  sipTrunkId!: string | null;

  @ManyToOne(() => SipTrunk, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sip_trunk_id' })
  sipTrunk!: SipTrunk | null;

  @Column({ type: 'varchar', length: 20 })
  direction!: AgentDirection;

  @Column({ type: 'varchar', length: 30, default: CallStatus.CREATING })
  status!: CallStatus;

  @Column({ type: 'varchar', length: 20, default: CallMedium.WEB })
  medium!: CallMedium;

  /** LiveKit room; null while status is pending (not dialed yet). */
  @Column({ name: 'room_name', type: 'varchar', length: 255, unique: true, nullable: true })
  roomName!: string | null;

  @Column({ name: 'livekit_dispatch_id', type: 'varchar', length: 255, nullable: true })
  livekitDispatchId!: string | null;

  @Column({ name: 'livekit_agent_name', type: 'varchar', length: 100, nullable: true })
  livekitAgentName!: string | null;

  @Column({ name: 'livekit_sip_call_id', type: 'varchar', length: 255, nullable: true })
  livekitSipCallId!: string | null;

  @Column({ name: 'participant_identity', type: 'varchar', length: 255, nullable: true })
  participantIdentity!: string | null;

  @Column({ name: 'from_number', type: 'varchar', length: 50, nullable: true })
  fromNumber!: string | null;

  @Column({ name: 'to_number', type: 'varchar', length: 50, nullable: true })
  toNumber!: string | null;

  /** Free-form request context (CRM fields, phoneNumber, etc.). */
  @Column({ type: 'jsonb', nullable: true })
  context!: Record<string, unknown> | null;

  /** LiveKit task key executed by the worker (e.g. confirm_appointment). */
  @Column({ name: 'task_key', type: 'varchar', length: 80, nullable: true })
  taskKey!: string | null;

  /** Structured result returned by the LiveKit task on completion. */
  @Column({ name: 'task_result', type: 'jsonb', nullable: true })
  taskResult!: Record<string, unknown> | null;

  /**
   * Explicit workflow flag (pending | completed | incomplete).
   * Set from worker `taskCompleted`, not inferred from task_result.
   */
  @Column({
    name: 'task_status',
    type: 'varchar',
    length: 20,
    default: CallTaskStatus.PENDING,
  })
  taskStatus!: CallTaskStatus;

  /** Conversation transcript from the worker session. */
  @Column({ type: 'jsonb', nullable: true })
  transcript!: CallTranscriptItem[] | null;

  /** Aggregated model usage (LLM/STT/TTS tokens, durations). */
  @Column({ type: 'jsonb', nullable: true })
  usage!: CallUsageSnapshot | null;

  /** Optional full LiveKit session report snapshot. */
  @Column({ name: 'session_report', type: 'jsonb', nullable: true })
  sessionReport!: Record<string, unknown> | null;

  /**
   * LiveKit list-price cost snapshot (no markup). Frozen at complete time.
   * Retries append attempts so totalUsd is real spend across dials.
   */
  @Column({ type: 'jsonb', nullable: true })
  cost!: CallCostSnapshot | null;

  /** Denormalized cost.totalUsd for SUM (numeric; pg returns string without transformer). */
  @Column({
    name: 'cost_usd',
    type: 'numeric',
    precision: 12,
    scale: 6,
    nullable: true,
    transformer: {
      to: (value: number | null | undefined) => value ?? null,
      from: (value: string | number | null) =>
        value == null || value === '' ? null : Number(value),
    },
  })
  costUsd!: number | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  /** Dial attempts so far (0 while pending; set to 1 when immediate dial starts). */
  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  /** Max dial attempts before giving up (retry logic later). */
  @Column({ name: 'max_attempts', type: 'int', default: 1 })
  maxAttempts!: number;

  /** When the call becomes eligible for the next attempt (queue claim later). */
  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt!: Date | null;

  /** Shared id for bulk enqueue groups (FK to call_batches.id when queued). */
  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId!: string | null;

  /** Higher values are claimed first within an org queue. */
  @Column({ type: 'int', default: 0 })
  priority!: number;

  /** Last classified failure (for retry policy). */
  @Column({ name: 'last_failure_code', type: 'varchar', length: 40, nullable: true })
  lastFailureCode!: string | null;

  @Column({ name: 'last_failure_at', type: 'timestamptz', nullable: true })
  lastFailureAt!: Date | null;

  /** When the current dial attempt started (rate-limit window). */
  @Column({ name: 'dial_started_at', type: 'timestamptz', nullable: true })
  dialStartedAt!: Date | null;

  /** Claim lease timestamp (stale reclaim if dialer dies mid-attempt). */
  @Column({ name: 'queue_locked_at', type: 'timestamptz', nullable: true })
  queueLockedAt!: Date | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'answered_at', type: 'timestamptz', nullable: true })
  answeredAt!: Date | null;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
