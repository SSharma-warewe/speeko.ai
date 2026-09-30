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
import { WhatsAppTaskSession } from './whatsapp-task-session.entity';

@Entity('whatsapp_tool_operations')
@Index(
  'uq_whatsapp_tool_operation',
  ['conversationId', 'generation', 'operationKey'],
  { unique: true, where: 'task_session_id IS NULL' },
)
@Index('uq_whatsapp_task_operation', ['taskSessionId', 'operationKey'], {
  unique: true,
  where: 'task_session_id IS NOT NULL',
})
export class WhatsAppToolOperation {
  @Column({ name: 'task_session_id', type: 'uuid', nullable: true })
  taskSessionId!: string | null;
  @ManyToOne(() => WhatsAppTaskSession, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'task_session_id' })
  taskSession!: WhatsAppTaskSession | null;
  @Column({ name: 'turn_id', type: 'uuid', nullable: true }) turnId!:
    string | null;
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
