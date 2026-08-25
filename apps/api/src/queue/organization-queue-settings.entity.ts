import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { QueueBackoffStrategy } from '@call-agent/contracts';
import { Organization } from '../organizations/organization.entity';
import {
  CallFailureCode,
  DEFAULT_RETRY_ON,
} from '../calls/call.entity';

export { QueueBackoffStrategy };

/**
 * Per-org outbound dial queue configuration (1:1 with organizations).
 */
@Entity({ name: 'organization_queue_settings' })
export class OrganizationQueueSettings {
  @PrimaryColumn({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @OneToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  /** Master switch: when false, dialer never claims for this org. */
  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  /** Soft pause: pending rows kept; no new claims. */
  @Column({ type: 'boolean', default: false })
  paused!: boolean;

  /** Max simultaneous in-flight calls (creating/dialing/ready). */
  @Column({ name: 'max_concurrent', type: 'int', default: 5 })
  maxConcurrent!: number;

  /** Max dial starts in a rolling 60s window. */
  @Column({ name: 'max_dials_per_minute', type: 'int', default: 30 })
  maxDialsPerMinute!: number;

  /** Default maxAttempts when enqueue omits it. */
  @Column({ name: 'default_max_attempts', type: 'int', default: 3 })
  defaultMaxAttempts!: number;

  @Column({
    name: 'backoff_strategy',
    type: 'varchar',
    length: 20,
    default: QueueBackoffStrategy.EXPONENTIAL,
  })
  backoffStrategy!: QueueBackoffStrategy;

  @Column({ name: 'backoff_base_seconds', type: 'int', default: 60 })
  backoffBaseSeconds!: number;

  @Column({ name: 'backoff_max_seconds', type: 'int', default: 3600 })
  backoffMaxSeconds!: number;

  /** Failure codes that may requeue (see CallFailureCode). */
  @Column({
    name: 'retry_on',
    type: 'jsonb',
    default: () => `'${JSON.stringify(DEFAULT_RETRY_ON)}'`,
  })
  retryOn!: CallFailureCode[];

  @Column({ name: 'quiet_hours_enabled', type: 'boolean', default: false })
  quietHoursEnabled!: boolean;

  /** HH:mm local time (inclusive start). */
  @Column({ name: 'quiet_hours_start', type: 'varchar', length: 5, nullable: true })
  quietHoursStart!: string | null;

  /** HH:mm local time (exclusive end). */
  @Column({ name: 'quiet_hours_end', type: 'varchar', length: 5, nullable: true })
  quietHoursEnd!: string | null;

  @Column({
    name: 'quiet_hours_timezone',
    type: 'varchar',
    length: 64,
    default: 'UTC',
  })
  quietHoursTimezone!: string;

  /** Max rows claimed per dialer tick per org. */
  @Column({ name: 'claim_batch_size', type: 'int', default: 5 })
  claimBatchSize!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
