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
import type { WhatsAppSendStatus } from '@call-agent/contracts';
import { WhatsAppTurn } from './whatsapp-turn.entity';

@Entity('whatsapp_message_outbox')
@Index('uq_whatsapp_outbox_turn', ['turnId'], { unique: true })
@Index('idx_whatsapp_outbox_ticker', ['status', 'nextAttemptAt'])
export class WhatsAppOutbox {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'turn_id', type: 'uuid' }) turnId!: string;
  @ManyToOne(() => WhatsAppTurn, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'turn_id' })
  turn!: WhatsAppTurn;
  @Column({ type: 'text' }) body!: string;
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: WhatsAppSendStatus;
  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount!: number;
  @Column({
    name: 'next_attempt_at',
    type: 'timestamptz',
    default: () => 'NOW()',
  })
  nextAttemptAt!: Date;
  @Column({ name: 'send_started_at', type: 'timestamptz', nullable: true })
  sendStartedAt!: Date | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) wamid!:
    string | null;
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
