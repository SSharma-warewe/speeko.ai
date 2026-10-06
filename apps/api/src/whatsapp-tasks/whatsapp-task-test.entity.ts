import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type {
  WhatsAppAgentToolId,
  WhatsAppSessionSnapshot,
  WhatsAppTaskSnapshot,
  WhatsAppTurnCheckpoint,
} from '@call-agent/contracts';
import { Organization } from '../organizations/organization.entity';
import { WhatsAppTask } from './whatsapp-task.entity';

@Entity('whatsapp_task_tests')
export class WhatsAppTaskTest {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'task_id', type: 'uuid' }) taskId!: string;
  @ManyToOne(() => WhatsAppTask, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'task_id' })
  task!: WhatsAppTask;
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;
  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization | null;
  @Column({ name: 'execution_organization_id', type: 'uuid' })
  executionOrganizationId!: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'execution_organization_id' })
  executionOrganization!: Organization;
  @Column({ type: 'jsonb' }) snapshot!: WhatsAppTaskSnapshot;
  @Column({ type: 'text' }) persona!: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) context!: Record<
    string,
    unknown
  >;
  @Column({
    name: 'failure_tools',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  failureTools!: WhatsAppAgentToolId[];
  @Column({
    type: 'jsonb',
    default: () => '\'{"state":{},"events":[]}\'::jsonb',
  })
  session!: WhatsAppSessionSnapshot;
  @Column({ name: 'tool_state', type: 'jsonb', default: () => "'{}'::jsonb" })
  toolState!: Record<string, unknown>;
  @Column({ type: 'varchar', length: 20, default: 'active' }) status!:
    'active' | 'completed' | 'cancelled';
  @Column({ type: 'varchar', length: 64, nullable: true }) outcome!:
    string | null;
  @Column({ type: 'jsonb', nullable: true }) result!: Record<
    string,
    unknown
  > | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
@Entity('whatsapp_task_test_turns')
@Index('uq_whatsapp_test_message', ['testId', 'clientMessageId'], {
  unique: true,
})
@Index('uq_whatsapp_test_running', ['testId'], {
  unique: true,
  where: "status = 'running'",
})
export class WhatsAppTaskTestTurn {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'test_id', type: 'uuid' }) testId!: string;
  @ManyToOne(() => WhatsAppTaskTest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'test_id' })
  test!: WhatsAppTaskTest;
  @Column({ name: 'client_message_id', type: 'uuid' }) clientMessageId!: string;
  @Column({ type: 'text' }) body!: string;
  @Column({ type: 'varchar', length: 20, default: 'pending' }) status!: string;
  @Column({ name: 'lease_token', type: 'uuid', nullable: true, select: false })
  leaseToken!: string | null;
  @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
  leaseExpiresAt!: Date | null;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;
  @Column({ name: 'base_session', type: 'jsonb', nullable: true })
  baseSession!: WhatsAppSessionSnapshot | null;
  @Column({ type: 'jsonb', nullable: true })
  checkpoint!: WhatsAppTurnCheckpoint | null;
  @Column({ type: 'text', nullable: true }) reply!: string | null;
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode!: string | null;
  @Column({
    name: 'tool_activity',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  toolActivity!: Array<{
    toolId: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
  }>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
