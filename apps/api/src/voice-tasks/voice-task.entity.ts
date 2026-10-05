import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { VoiceTaskDefinition } from '@call-agent/contracts';
import { Organization } from '../organizations/organization.entity';

@Entity('voice_tasks')
@Index('idx_voice_tasks_organization_id', ['organizationId'])
export class VoiceTask {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;
  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization | null;
  @Index({ unique: true })
  @Column({ name: 'starter_key', type: 'varchar', length: 80, nullable: true })
  starterKey!: string | null;
  @Column({ type: 'jsonb' }) draft!: VoiceTaskDefinition;
  @Column({ name: 'draft_revision', type: 'int', default: 1 })
  draftRevision!: number;
  @Column({ name: 'published_version', type: 'int', nullable: true })
  publishedVersion!: number | null;
  @Column({ type: 'boolean', default: false }) archived!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

@Entity('voice_task_versions')
export class VoiceTaskVersionEntity {
  @PrimaryColumn({ name: 'task_id', type: 'uuid' }) taskId!: string;
  @PrimaryColumn({ type: 'int' }) version!: number;
  @ManyToOne(() => VoiceTask, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'task_id' })
  task!: VoiceTask;
  @Column({ type: 'jsonb' }) definition!: VoiceTaskDefinition;
  @CreateDateColumn({ name: 'published_at', type: 'timestamptz' })
  publishedAt!: Date;
}
