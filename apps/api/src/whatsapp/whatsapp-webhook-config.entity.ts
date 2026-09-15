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
import { Organization } from '../organizations/organization.entity';

/**
 * Per-org Meta webhook subscription (verify token + phone / WABA routing).
 * Raw verify token is shown once on generate; only the SHA-256 hash is stored.
 */
@Entity({ name: 'whatsapp_webhook_configs' })
@Index('idx_whatsapp_webhook_configs_organization_id', ['organizationId'], {
  unique: true,
})
@Index('idx_whatsapp_webhook_configs_phone_number_id', ['phoneNumberId'], {
  unique: true,
})
@Index('idx_whatsapp_webhook_configs_waba_id', ['wabaId'], { unique: true })
@Index('idx_whatsapp_webhook_configs_verify_token_hash', ['verifyTokenHash'], {
  unique: true,
})
export class WhatsAppWebhookConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  /** WhatsApp Business phone number id from Meta (`metadata.phone_number_id`). */
  @Column({ name: 'phone_number_id', type: 'varchar', length: 80, nullable: true })
  phoneNumberId!: string | null;

  /** WhatsApp Business Account id (`entry.id`). */
  @Column({ name: 'waba_id', type: 'varchar', length: 80, nullable: true })
  wabaId!: string | null;

  /** SHA-256 hex of the verify token. Never return in API responses. */
  @Column({ name: 'verify_token_hash', type: 'varchar', length: 64 })
  verifyTokenHash!: string;

  /** Display prefix only, e.g. first 8 chars + ellipsis. */
  @Column({ name: 'verify_token_prefix', type: 'varchar', length: 24 })
  verifyTokenPrefix!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
