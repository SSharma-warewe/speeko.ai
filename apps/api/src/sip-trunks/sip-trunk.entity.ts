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

export enum SipTrunkDirection {
  OUTBOUND = 'outbound',
  INBOUND = 'inbound',
}

@Entity({ name: 'sip_trunks' })
@Index('idx_sip_trunks_organization_id', ['organizationId'])
@Index('idx_sip_trunks_livekit_trunk_id', ['livekitTrunkId'], { unique: true })
export class SipTrunk {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 20, default: SipTrunkDirection.OUTBOUND })
  direction!: SipTrunkDirection;

  /** SIP provider hostname (e.g. sip.telnyx.com) — needed when provisioning via LiveKit API. */
  @Column({ name: 'provider_address', type: 'varchar', length: 255, nullable: true })
  providerAddress!: string | null;

  @Column({ name: 'auth_username', type: 'varchar', length: 255, nullable: true })
  authUsername!: string | null;

  /** Never expose in API responses. */
  @Column({ name: 'auth_password', type: 'text', nullable: true })
  authPassword!: string | null;

  /** Provider numbers on this trunk, e.g. ["+918065179684"]. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  numbers!: string[];

  /**
   * LiveKit Cloud trunk id (ST_…). Null while inbound draft is unpublished.
   * Outbound rows always set this on create (link or provision).
   */
  @Column({ name: 'livekit_trunk_id', type: 'varchar', length: 100, nullable: true })
  livekitTrunkId!: string | null;

  /** Inbound: only accept calls from these caller numbers (LiveKit allowedNumbers). */
  @Column({ name: 'allowed_numbers', type: 'jsonb', default: () => "'[]'" })
  allowedNumbers!: string[];

  /** Inbound: only accept SIP from these IPs/CIDRs (LiveKit allowedAddresses). */
  @Column({ name: 'allowed_addresses', type: 'jsonb', default: () => "'[]'" })
  allowedAddresses!: string[];

  /** Inbound: Krisp noise cancellation on the caller. */
  @Column({ name: 'krisp_enabled', type: 'boolean', default: true })
  krispEnabled!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  /** When the trunk was published to LiveKit (inbound draft flow). */
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
