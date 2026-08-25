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
import { CallBatchStatus } from '@call-agent/contracts';
import { OrganizationAgent } from '../agents/organization-agent.entity';
import { Organization } from '../organizations/organization.entity';
import { SipTrunk } from '../sip-trunks/sip-trunk.entity';

export { CallBatchStatus };

/**
 * Bulk enqueue group with pause/cancel and optional concurrency overrides.
 */
@Entity({ name: 'call_batches' })
@Index('idx_call_batches_organization_id', ['organizationId'])
@Index('idx_call_batches_status', ['status'])
export class CallBatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({
    type: 'varchar',
    length: 20,
    default: CallBatchStatus.RUNNING,
  })
  status!: CallBatchStatus;

  @Column({ name: 'organization_agent_id', type: 'uuid', nullable: true })
  organizationAgentId!: string | null;

  @ManyToOne(() => OrganizationAgent, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'organization_agent_id' })
  organizationAgent!: OrganizationAgent | null;

  @Column({ name: 'sip_trunk_id', type: 'uuid', nullable: true })
  sipTrunkId!: string | null;

  @ManyToOne(() => SipTrunk, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sip_trunk_id' })
  sipTrunk!: SipTrunk | null;

  @Column({ name: 'task_key', type: 'varchar', length: 80, nullable: true })
  taskKey!: string | null;

  /** Override org default max attempts for calls in this batch. */
  @Column({ name: 'max_attempts', type: 'int', nullable: true })
  maxAttempts!: number | null;

  /** Optional batch-level concurrency override (null = use org). */
  @Column({ name: 'max_concurrent', type: 'int', nullable: true })
  maxConcurrent!: number | null;

  /** Higher claimed first; applied to calls when enqueueing. */
  @Column({ type: 'int', default: 0 })
  priority!: number;

  @Column({ name: 'total_count', type: 'int', default: 0 })
  totalCount!: number;

  @Column({ name: 'paused_at', type: 'timestamptz', nullable: true })
  pausedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
