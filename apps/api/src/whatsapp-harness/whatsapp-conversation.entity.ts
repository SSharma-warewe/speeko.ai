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
import type { WhatsAppSessionSnapshot } from '@call-agent/contracts';
import { Organization } from '../organizations/organization.entity';
import { OrganizationIntegration } from '../organization-integrations/organization-integration.entity';

@Entity('whatsapp_conversations')
@Index(
  'uq_whatsapp_conversation_connection_sender',
  ['connectionId', 'sender'],
  { unique: true },
)
export class WhatsAppConversation {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;
  @Column({ name: 'connection_id', type: 'uuid' }) connectionId!: string;
  @ManyToOne(() => OrganizationIntegration, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connection_id' })
  connection!: OrganizationIntegration;
  @Column({ type: 'varchar', length: 20 }) sender!: string;
  @Column({ type: 'integer', default: 1 }) generation!: number;
  @Column({ name: 'next_sequence', type: 'integer', default: 1 })
  nextSequence!: number;
  @Column({
    type: 'jsonb',
    default: () => '\'{"state":{},"events":[]}\'::jsonb',
  })
  session!: WhatsAppSessionSnapshot;
  /** Trusted booking state is maintained by the API, never supplied by the LLM. */
  @Column({ name: 'tool_state', type: 'jsonb', default: () => "'{}'::jsonb" })
  toolState!: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
