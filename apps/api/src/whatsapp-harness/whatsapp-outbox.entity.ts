import {
  Column,
  Check,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  WhatsAppSendStatus,
  WhatsAppDeliveryKind,
} from '@call-agent/contracts';
import { WhatsAppTurn } from './whatsapp-turn.entity';
import { OtpChallenge } from '../otp/otp-challenge.entity';

@Entity('whatsapp_message_outbox')
@Check(
  'ck_whatsapp_outbox_kind',
  `("kind"='text' AND turn_id IS NOT NULL AND body IS NOT NULL AND challenge_id IS NULL AND encrypted_code IS NULL) OR ("kind"='otp_template' AND turn_id IS NULL AND body IS NULL AND challenge_id IS NOT NULL AND phone_number_id IS NOT NULL AND graph_version IS NOT NULL AND template_name IS NOT NULL)`,
)
@Index('uq_whatsapp_outbox_challenge', ['challengeId'], { unique: true })
@Index('uq_whatsapp_outbox_turn', ['turnId'], { unique: true })
@Index('idx_whatsapp_outbox_ticker', ['status', 'nextAttemptAt'])
export class WhatsAppOutbox {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 20, default: 'text' })
  kind!: WhatsAppDeliveryKind;
  @Column({ name: 'turn_id', type: 'uuid', nullable: true }) turnId!:
    string | null;
  @ManyToOne(() => WhatsAppTurn, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'turn_id' })
  turn!: WhatsAppTurn | null;
  @Column({ name: 'challenge_id', type: 'uuid', nullable: true }) challengeId!:
    string | null;
  @ManyToOne(() => OtpChallenge, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'challenge_id' })
  challenge!: OtpChallenge | null;
  @Column({
    name: 'encrypted_code',
    type: 'text',
    nullable: true,
    select: false,
  })
  encryptedCode!: string | null;
  @Column({
    name: 'phone_number_id',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  phoneNumberId!: string | null;
  @Column({
    name: 'graph_version',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  graphVersion!: string | null;
  @Column({
    name: 'template_name',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  templateName!: string | null;
  @Column({ type: 'text', nullable: true }) body!: string | null;
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
