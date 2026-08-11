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
import { OrganizationAgent } from '../agents/organization-agent.entity';
import { Organization } from '../organizations/organization.entity';
import { SipTrunk } from '../sip-trunks/sip-trunk.entity';
import { User } from '../users/user.entity';

/**
 * Preconfigured public dial-in endpoint for CRM / external integrations.
 * Heavy config (agent, task, trunk, queue overrides) lives here;
 * external callers only send phoneNumber + sparse context + API key.
 */
@Entity({ name: 'integration_endpoints' })
@Index('idx_integration_endpoints_organization_id', ['organizationId'])
@Index('idx_integration_endpoints_public_id', ['publicId'], { unique: true })
export class IntegrationEndpoint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  /** Opaque URL segment for POST /api/integrations/:publicId/calls */
  @Column({ name: 'public_id', type: 'varchar', length: 32 })
  publicId!: string;

  /** Display prefix of the secret, e.g. ca_live_ab12cd */
  @Column({ name: 'key_prefix', type: 'varchar', length: 24 })
  keyPrefix!: string;

  /** SHA-256 hex of the full API key. Never return in responses. */
  @Column({ name: 'key_hash', type: 'varchar', length: 64 })
  keyHash!: string;

  @Column({ name: 'organization_agent_id', type: 'uuid' })
  organizationAgentId!: string;

  @ManyToOne(() => OrganizationAgent, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_agent_id' })
  organizationAgent!: OrganizationAgent;

  /** LiveKit task key baked into this endpoint (CRM cannot override). */
  @Column({ name: 'task_key', type: 'varchar', length: 80 })
  taskKey!: string;

  @Column({ name: 'sip_trunk_id', type: 'uuid', nullable: true })
  sipTrunkId!: string | null;

  @ManyToOne(() => SipTrunk, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sip_trunk_id' })
  sipTrunk!: SipTrunk | null;

  @Column({ name: 'max_attempts', type: 'int', nullable: true })
  maxAttempts!: number | null;

  @Column({ type: 'int', default: 0 })
  priority!: number;

  @Column({ name: 'max_concurrent', type: 'int', nullable: true })
  maxConcurrent!: number | null;

  /** Static context merged under each request's context. */
  @Column({ name: 'default_context', type: 'jsonb', nullable: true })
  defaultContext!: Record<string, unknown> | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

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
