import { WhatsAppTask } from '../whatsapp-tasks/whatsapp-task.entity';
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
import { IntegrationProvider } from '@call-agent/contracts';
import { Organization } from '../organizations/organization.entity';
import { User } from '../users/user.entity';
import { OrganizationAgent } from '../agents/organization-agent.entity';
import { ToolProfile } from '../tools/tool-profile.entity';

export { IntegrationProvider };

/**
 * Org-owned third-party credentials (calendar, live ghl_crm workspace, contacts, WhatsApp).
 * API keys are secrets — never return `apiKey` in list/get responses.
 */
@Entity({ name: 'organization_integrations' })
@Index('idx_organization_integrations_organization_id', ['organizationId'])
@Index('idx_organization_integrations_org_provider', [
  'organizationId',
  'provider',
])
export class OrganizationIntegration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 40, default: IntegrationProvider.NYLAS })
  provider!: IntegrationProvider;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  /** Nylas API key, GHL PIT, or Meta WhatsApp access token. Never expose in API responses. */
  @Column({ name: 'api_key', type: 'text' })
  apiKey!: string;

  /** Display prefix only, e.g. first 8 chars of the key. */
  @Column({ name: 'api_key_prefix', type: 'varchar', length: 24 })
  apiKeyPrefix!: string;

  /** Nylas grant id. Null for GoHighLevel. */
  @Column({ name: 'grant_id', type: 'varchar', length: 120, nullable: true })
  grantId!: string | null;

  /** GHL location (sub-account) id. Null for Nylas. */
  @Column({ name: 'location_id', type: 'varchar', length: 120, nullable: true })
  locationId!: string | null;

  /** Meta WhatsApp Cloud phone number id (provider=whatsapp). */
  @Column({
    name: 'phone_number_id',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  phoneNumberId!: string | null;

  /** Meta WhatsApp Business Account id (provider=whatsapp). */
  @Column({ name: 'waba_id', type: 'varchar', length: 80, nullable: true })
  wabaId!: string | null;

  /**
   * WhatsApp inbound agent persona (provider=whatsapp only).
   * Null/empty = auto-replies disabled for this org line.
   */
  @Column({ name: 'system_prompt', type: 'text', nullable: true })
  systemPrompt!: string | null;

  @Column({
    name: 'whatsapp_task_key',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  whatsappTaskKey!: import('@call-agent/contracts').WhatsAppTaskKey | null;

  @Column({ name: 'whatsapp_task_id', type: 'uuid', nullable: true })
  whatsappTaskId!: string | null;
  @ManyToOne(() => WhatsAppTask, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'whatsapp_task_id' })
  whatsappTask!: WhatsAppTask | null;
  @Column({
    name: 'whatsapp_task_context',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  whatsappTaskContext!: Record<string, unknown>;

  /** Existing voice agent whose GHL calendar powers WhatsApp booking. */
  @Column({ name: 'booking_voice_agent_id', type: 'uuid', nullable: true })
  bookingVoiceAgentId!: string | null;

  @ManyToOne(() => OrganizationAgent, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'booking_voice_agent_id' })
  bookingVoiceAgent!: OrganizationAgent | null;

  /** Tool profile controlling the GHL tools exposed to this WhatsApp agent. */
  @Column({ name: 'whatsapp_tool_profile_id', type: 'uuid', nullable: true })
  whatsappToolProfileId!: string | null;

  @ManyToOne(() => ToolProfile, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'whatsapp_tool_profile_id' })
  whatsappToolProfile!: ToolProfile | null;

  /** Calendar id within the grant (Nylas, default primary) or GHL calendar id. */
  @Column({
    name: 'calendar_id',
    type: 'varchar',
    length: 255,
    default: 'primary',
  })
  calendarId!: string;

  /** Nylas API base URI (US or EU). */
  @Column({
    name: 'api_uri',
    type: 'varchar',
    length: 255,
    default: 'https://api.us.nylas.com',
  })
  apiUri!: string;

  /**
   * Email associated with the grant (used for free/busy queries).
   * Optional but strongly recommended for checkCalendarAvailability.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser!: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
