import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { WhatsAppOutboundStatus } from '@call-agent/contracts';
import { OrganizationIntegration } from '../organization-integrations/organization-integration.entity';
import { Organization } from '../organizations/organization.entity';

/**
 * One outbound WhatsApp template send attempt (send log only — CRM contacts
 * are fetched live and never copied into our database).
 */
@Entity({ name: 'whatsapp_outbound_messages' })
@Index('idx_whatsapp_outbound_messages_org_created', [
  'organizationId',
  'createdAt',
])
@Index('idx_whatsapp_outbound_messages_batch_key', ['batchKey'])
export class WhatsAppOutboundMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  /** WhatsApp Cloud connection used to send (`organization_integrations`). */
  @Column({ name: 'integration_id', type: 'uuid', nullable: true })
  integrationId!: string | null;

  @ManyToOne(() => OrganizationIntegration, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'integration_id' })
  integration!: OrganizationIntegration | null;

  /** Groups the rows of a single send request. */
  @Column({ name: 'batch_key', type: 'uuid' })
  batchKey!: string;

  @Column({ name: 'contact_name', type: 'varchar', length: 255, nullable: true })
  contactName!: string | null;

  /** Recipient phone, digits only (E.164 without `+`). */
  @Column({ type: 'varchar', length: 32 })
  phone!: string;

  @Column({ name: 'ghl_contact_id', type: 'varchar', length: 120, nullable: true })
  ghlContactId!: string | null;

  @Column({ name: 'template_name', type: 'varchar', length: 512 })
  templateName!: string;

  @Column({ type: 'varchar', length: 20 })
  language!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: WhatsAppOutboundStatus;

  /** Meta message id (`wamid…`) on success. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  wamid!: string | null;

  /** Short failure / skip reason. Never contains tokens. */
  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
