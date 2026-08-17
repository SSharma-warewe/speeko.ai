import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { ToolProfile } from '../tools/tool-profile.entity';
import { Agent } from './agent.entity';

/**
 * Org-owned agent instance: named concurrent config (persona + tools + hooks).
 * Multiple rows may share the same platform template (`agent_id`); uniqueness
 * is by `(organization_id, slug)`. Workflows are selected per call via task key.
 */
@Entity({ name: 'organization_agents' })
@Unique('uq_organization_agents_org_slug', ['organizationId', 'slug'])
@Index('idx_organization_agents_organization_id', ['organizationId'])
@Index('idx_organization_agents_agent_id', ['agentId'])
export class OrganizationAgent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, (org) => org.organizationAgents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  /** Platform template this config was created from (direction / seed source). */
  @Column({ name: 'agent_id', type: 'uuid' })
  agentId!: string;

  @ManyToOne(() => Agent, (agent) => agent.organizationAgents, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'agent_id' })
  agent!: Agent;

  /** Human label for this org config (e.g. "Booking confirmations"). */
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /**
   * Stable unique-per-org identifier (URL/CRM friendly).
   * Unique with organizationId via uq_organization_agents_org_slug.
   */
  @Column({ type: 'varchar', length: 80 })
  slug!: string;

  /** Persona only (identity, tone, policies). */
  @Column({ name: 'system_prompt', type: 'text' })
  systemPrompt!: string;

  /**
   * LiveKit parent Agent onEnter generateReply instructions.
   * null = built-in default; empty string = skip opening speech.
   */
  @Column({ name: 'on_enter_instructions', type: 'text', nullable: true })
  onEnterInstructions!: string | null;

  /**
   * Spoken closing line for LiveKit parent Agent onExit (session.say).
   * null = built-in default; empty string = skip closing speech.
   */
  @Column({ name: 'on_exit_instructions', type: 'text', nullable: true })
  onExitInstructions!: string | null;

  @Column({ name: 'tool_profile_id', type: 'uuid', nullable: true })
  toolProfileId!: string | null;

  @ManyToOne(() => ToolProfile, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'tool_profile_id' })
  toolProfile!: ToolProfile | null;

  /**
   * Org Nylas (or future) calendar connection used by calendar tools on this agent.
   * Capability enablement stays on the tool profile; this selects which account.
   */
  @Column({ name: 'calendar_integration_id', type: 'uuid', nullable: true })
  calendarIntegrationId!: string | null;

  /** Default task when outbound request omits `task`. */
  @Column({ name: 'default_task_key', type: 'varchar', length: 80, nullable: true })
  defaultTaskKey!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  voice!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model!: string | null;

  @Column({ type: 'real', nullable: true })
  temperature!: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
