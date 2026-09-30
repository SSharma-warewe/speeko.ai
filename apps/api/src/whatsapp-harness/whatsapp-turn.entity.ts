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
import type {
  WhatsAppSessionSnapshot,
  WhatsAppTurnCheckpoint,
  WhatsAppTurnStatus,
} from '@call-agent/contracts';
import { WhatsAppConversation } from './whatsapp-conversation.entity';
import { WhatsAppTaskSession } from './whatsapp-task-session.entity';

@Entity('whatsapp_agent_turns')
@Index('uq_whatsapp_turn_meta_message', ['phoneNumberId', 'messageId'], {
  unique: true,
})
@Index('uq_whatsapp_turn_sequence', ['conversationId', 'sequence'], {
  unique: true,
})
@Index('idx_whatsapp_turn_ticker', ['status', 'nextAttemptAt'])
export class WhatsAppTurn {
  /** Null identifies pre-task org work, which must never be silently replayed. */
  @Column({ name: 'task_protocol_version', type: 'integer', nullable: true })
  taskProtocolVersion!: number | null;
  @Column({ name: 'task_session_id', type: 'uuid', nullable: true })
  taskSessionId!: string | null;
  @ManyToOne(() => WhatsAppTaskSession, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'task_session_id' })
  taskSession!: WhatsAppTaskSession | null;
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'conversation_id', type: 'uuid' }) conversationId!: string;
  @ManyToOne(() => WhatsAppConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: WhatsAppConversation;
  @Column({ name: 'phone_number_id', type: 'varchar', length: 80 })
  phoneNumberId!: string;
  @Column({ name: 'message_id', type: 'varchar', length: 255 })
  messageId!: string;
  @Column({ type: 'integer' }) generation!: number;
  @Column({ type: 'integer' }) sequence!: number;
  @Column({ type: 'text' }) body!: string;
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: WhatsAppTurnStatus;
  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount!: number;
  @Column({
    name: 'next_attempt_at',
    type: 'timestamptz',
    default: () => 'NOW()',
  })
  nextAttemptAt!: Date;
  @Column({ name: 'lease_token', type: 'uuid', nullable: true }) leaseToken!:
    string | null;
  @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
  leaseExpiresAt!: Date | null;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;
  @Column({ name: 'base_session', type: 'jsonb', nullable: true })
  baseSession!: WhatsAppSessionSnapshot | null;
  @Column({ type: 'jsonb', nullable: true })
  checkpoint!: WhatsAppTurnCheckpoint | null;
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
