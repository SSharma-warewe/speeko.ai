import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Call } from '../calls/call.entity';
import { Organization } from '../organizations/organization.entity';

/** Immutable rate-budget charge for one committed outbound queue admission. */
@Entity({ name: 'queue_admissions' })
@Index('idx_queue_admissions_org_time', ['organizationId', 'admittedAt'])
@Index('idx_queue_admissions_time', ['admittedAt'])
@Index('idx_queue_admissions_call_time', ['callId', 'admittedAt'], {
  unique: true,
})
export class QueueAdmission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'call_id', type: 'uuid', nullable: true })
  callId!: string | null;

  @ManyToOne(() => Call, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'call_id' })
  call!: Call | null;

  @Column({ name: 'admitted_at', type: 'timestamptz', update: false })
  admittedAt!: Date;
}
