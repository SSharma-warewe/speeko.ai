import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  WhatsAppSessionSnapshot,
  WhatsAppTaskConfiguration,
} from '@call-agent/contracts';
import { WhatsAppConversation } from './whatsapp-conversation.entity';

@Entity('whatsapp_task_sessions')
@Check(
  'ck_whatsapp_task_status',
  "status IN ('active','completed','cancelled')",
)
@Index('uq_whatsapp_active_task', ['conversationId'], {
  unique: true,
  where: "status = 'active'",
})
@Index('idx_whatsapp_task_history', ['conversationId', 'createdAt'])
export class WhatsAppTaskSession {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'conversation_id', type: 'uuid' }) conversationId!: string;
  @ManyToOne(() => WhatsAppConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: WhatsAppConversation;
  @Column({ type: 'integer' }) generation!: number;
  @Column({ type: 'jsonb' }) configuration!: WhatsAppTaskConfiguration;
  @Column({ type: 'varchar', length: 20, default: 'active' }) status!:
    'active' | 'completed' | 'cancelled';
  @Column({ type: 'varchar', length: 30, nullable: true }) outcome!:
    'booked' | 'declined' | 'reset' | null;
  @Column({ type: 'jsonb', nullable: true }) result!: Record<
    string,
    unknown
  > | null;
  @Column({
    type: 'jsonb',
    default: () => '\'{"state":{},"events":[]}\'::jsonb',
  })
  session!: WhatsAppSessionSnapshot;
  @Column({ name: 'tool_state', type: 'jsonb', default: () => "'{}'::jsonb" })
  toolState!: Record<string, unknown>;
  /** UUID of the sole turn allowed to finish a closed task's final confirmation. */
  @Column({ name: 'terminal_turn_id', type: 'uuid', nullable: true })
  terminalTurnId!: string | null;
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
