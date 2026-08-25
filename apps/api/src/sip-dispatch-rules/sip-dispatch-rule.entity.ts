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
import { SipDispatchRuleType } from '@call-agent/contracts';
import { OrganizationAgent } from '../agents/organization-agent.entity';
import { Organization } from '../organizations/organization.entity';

export { SipDispatchRuleType };

@Entity({ name: 'sip_dispatch_rules' })
@Index('idx_sip_dispatch_rules_organization_id', ['organizationId'])
@Index('idx_sip_dispatch_rules_livekit_id', ['livekitDispatchRuleId'], {
  unique: true,
})
export class SipDispatchRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({
    name: 'rule_type',
    type: 'varchar',
    length: 30,
    default: SipDispatchRuleType.INDIVIDUAL,
  })
  ruleType!: SipDispatchRuleType;

  /** individual / callee room name prefix (e.g. call-). */
  @Column({ name: 'room_prefix', type: 'varchar', length: 100, nullable: true })
  roomPrefix!: string | null;

  /** direct rule: fixed room name. */
  @Column({ name: 'room_name', type: 'varchar', length: 255, nullable: true })
  roomName!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  pin!: string | null;

  /** callee: append random suffix per caller. */
  @Column({ type: 'boolean', default: false })
  randomize!: boolean;

  /** Local sip_trunks.id values (inbound) this rule is bound to. */
  @Column({ name: 'sip_trunk_ids', type: 'jsonb', default: () => "'[]'" })
  sipTrunkIds!: string[];

  @Column({ name: 'hide_phone_number', type: 'boolean', default: false })
  hidePhoneNumber!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  attributes!: Record<string, string> | null;

  /** Optional LiveKit participant metadata string on the rule. */
  @Column({ type: 'text', nullable: true })
  metadata!: string | null;

  @Column({ name: 'organization_agent_id', type: 'uuid', nullable: true })
  organizationAgentId!: string | null;

  @ManyToOne(() => OrganizationAgent, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'organization_agent_id' })
  organizationAgent!: OrganizationAgent | null;

  /** LiveKit agent name for roomConfig dispatch; defaults to LIVEKIT_AGENT_NAME. */
  @Column({ name: 'agent_name', type: 'varchar', length: 100, nullable: true })
  agentName!: string | null;

  /** LiveKit dispatch rule id (SDR_…). Null while draft. */
  @Column({
    name: 'livekit_dispatch_rule_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  livekitDispatchRuleId!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
