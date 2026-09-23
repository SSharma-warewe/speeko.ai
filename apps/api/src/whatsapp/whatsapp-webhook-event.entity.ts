import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from '../organizations/organization.entity';

/**
 * Raw Meta WhatsApp webhook POST (one row per HTTP request).
 * `organizationId` is set when phone_number_id or WABA id matches a config.
 */
@Entity({ name: 'whatsapp_webhook_events' })
@Index('idx_whatsapp_webhook_events_organization_id', ['organizationId'])
@Index('idx_whatsapp_webhook_events_received_at', ['receivedAt'])
export class WhatsAppWebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization | null;

  /** First `entry[].changes[].field`, or `unknown`. */
  @Column({ name: 'event_type', type: 'varchar', length: 80 })
  eventType!: string;

  /** Raw JSON body. Non-JSON / empty posts are stored as `{ raw: null | string }`. */
  @Column({ type: 'jsonb' })
  payload!: unknown;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;
}
