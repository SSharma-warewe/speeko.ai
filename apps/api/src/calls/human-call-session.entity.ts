import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { HumanCallPhase, HumanCallWorkspace } from '@call-agent/contracts';
import { Call } from './call.entity';
import { Organization } from '../organizations/organization.entity';
import { User } from '../users/user.entity';
import { OrganizationIntegration } from '../organization-integrations/organization-integration.entity';

@Entity({ name: 'human_call_sessions' })
@Index('uq_human_call_request', ['organizationId', 'requestId'], {
  unique: true,
})
@Index('uq_human_call_active_user', ['userId'], {
  unique: true,
  where: 'finished_at IS NULL',
})
@Index('idx_human_call_due', ['nextCheckAt'])
export class HumanCallSession {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'call_id', type: 'uuid', unique: true }) callId!: string;
  @OneToOne(() => Call, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'call_id' })
  call!: Call;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId!:
    string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;
  @Column({ name: 'caller_name', type: 'varchar', length: 255 })
  callerName!: string;
  @Column({ name: 'crm_integration_id', type: 'uuid', nullable: true })
  crmIntegrationId!: string | null;
  @ManyToOne(() => OrganizationIntegration, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'crm_integration_id' })
  crmIntegration!: OrganizationIntegration | null;
  @Column({ name: 'crm_contact_id', type: 'varchar', length: 100 })
  crmContactId!: string;
  @Column({ name: 'contact_name', type: 'varchar', length: 255 })
  contactName!: string;
  @Column({ name: 'contact_phone', type: 'varchar', length: 32 })
  contactPhone!: string;
  @Column({ name: 'request_id', type: 'uuid' }) requestId!: string;
  @Column({ name: 'selection', type: 'jsonb' }) selection!: {
    crmIntegrationId: string;
    crmContactId: string;
    sipTrunkId: string;
    selectedTools?: import('@call-agent/contracts').HumanCallToolId[];
  };
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  workspace!: Omit<Partial<HumanCallWorkspace>, 'actions'> & {
    actions?: (HumanCallWorkspace['actions'][number] & { fingerprint?: string })[];
  };
  @Column({ name: 'browser_identity', type: 'varchar', length: 100 })
  browserIdentity!: string;
  @Column({ name: 'sip_identity', type: 'varchar', length: 100 })
  sipIdentity!: string;
  @Column({ type: 'varchar', length: 30, default: 'preparing' })
  phase!: HumanCallPhase;
  @Column({ name: 'join_deadline', type: 'timestamptz' }) joinDeadline!: Date;
  @Column({ name: 'room_ready_at', type: 'timestamptz', nullable: true })
  roomReadyAt!: Date | null;
  @Column({ name: 'dial_attempted_at', type: 'timestamptz', nullable: true })
  dialAttemptedAt!: Date | null;
  @Column({ name: 'dial_settled_at', type: 'timestamptz', nullable: true })
  dialSettledAt!: Date | null;
  @Column({ name: 'browser_joined_at', type: 'timestamptz', nullable: true })
  browserJoinedAt!: Date | null;
  @Column({
    name: 'browser_missing_since',
    type: 'timestamptz',
    nullable: true,
  })
  browserMissingSince!: Date | null;
  @Column({ name: 'end_reason', type: 'varchar', length: 100, nullable: true })
  endReason!: string | null;
  @Column({
    name: 'terminal_status',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  terminalStatus!: 'completed' | 'cancelled' | 'failed' | null;
  @Column({ name: 'lease_token', type: 'uuid', nullable: true }) leaseToken!:
    string | null;
  @Column({ name: 'lease_until', type: 'timestamptz', nullable: true })
  leaseUntil!: Date | null;
  @Column({
    name: 'next_check_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  nextCheckAt!: Date;
  @Column({ name: 'cleanup_started_at', type: 'timestamptz', nullable: true })
  cleanupStartedAt!: Date | null;
  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;
}
