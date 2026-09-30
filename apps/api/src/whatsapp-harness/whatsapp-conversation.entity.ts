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
  WhatsAppSessionSnapshot,
  WhatsAppConversationScope,
} from '@call-agent/contracts';
import { Organization } from '../organizations/organization.entity';
import { OrganizationIntegration } from '../organization-integrations/organization-integration.entity';

@Entity('whatsapp_conversations')
@Check(
  'ck_whatsapp_conversation_scope',
  `("scope"='org' AND organization_id IS NOT NULL AND connection_id IS NOT NULL AND platform_phone_number_id IS NULL) OR ("scope"='platform' AND organization_id IS NULL AND connection_id IS NULL AND platform_phone_number_id IS NOT NULL)`,
)
@Index('uq_whatsapp_platform_sender', ['platformPhoneNumberId', 'sender'], {
  unique: true,
  where: `"scope"='platform'`,
})
@Index(
  'uq_whatsapp_conversation_connection_sender',
  ['connectionId', 'sender'],
  { unique: true },
)
export class WhatsAppConversation {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 20, default: 'org' })
  scope!: WhatsAppConversationScope;
  @Column({
    name: 'platform_phone_number_id',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  platformPhoneNumberId!: string | null;
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;
  @Column({ name: 'connection_id', type: 'uuid', nullable: true })
  connectionId!: string | null;
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
