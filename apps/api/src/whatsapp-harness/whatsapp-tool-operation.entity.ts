import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WhatsAppConversation } from './whatsapp-conversation.entity';

@Entity('whatsapp_tool_operations')
@Index(
  'uq_whatsapp_tool_operation',
  ['conversationId', 'generation', 'operationKey'],
  { unique: true },
)
export class WhatsAppToolOperation {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'conversation_id', type: 'uuid' }) conversationId!: string;
  @ManyToOne(() => WhatsAppConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: WhatsAppConversation;
  @Column({ type: 'integer' }) generation!: number;
  @Column({ name: 'operation_key', type: 'varchar', length: 64 })
  operationKey!: string;
  @Column({ name: 'tool_id', type: 'varchar', length: 80 }) toolId!: string;
  @Column({ type: 'varchar', length: 20, default: 'running' }) status!:
    'running' | 'finished';
  @Column({ type: 'jsonb', nullable: true }) result!: Record<
    string,
    unknown
  > | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
