import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AgentDirection } from '@call-agent/contracts';
import { ToolProfile } from '../tools/tool-profile.entity';
import { OrganizationAgent } from './organization-agent.entity';

export { AgentDirection };

/**
 * Platform AI agent **template** (persona + defaults).
 * Workflows live in LiveKit Tasks (worker); capabilities come from tool profiles.
 */
@Entity({ name: 'agents' })
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  key!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  direction!: AgentDirection;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /**
   * Persona only: identity, tone, company, policies, safety.
   * Do not encode call-specific workflows here — use LiveKit Tasks.
   */
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

  /** Default LiveKit task key (e.g. general, confirm_appointment). */
  @Column({ name: 'default_task_key', type: 'varchar', length: 80, default: 'general' })
  defaultTaskKey!: string;

  @Column({ name: 'default_tool_profile_id', type: 'uuid', nullable: true })
  defaultToolProfileId!: string | null;

  @ManyToOne(() => ToolProfile, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'default_tool_profile_id' })
  defaultToolProfile!: ToolProfile | null;

  /** Optional TTS voice override (provider-specific id/name). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  voice!: string | null;

  /** Optional LLM model override (LiveKit Inference model id). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  model!: string | null;

  @Column({ type: 'real', nullable: true })
  temperature!: number | null;

  /** Inworld TTS speaking_rate multiplier (0.5–1.5). null = provider default. */
  @Column({ name: 'speaking_rate', type: 'real', nullable: true })
  speakingRate!: number | null;

  /** Inworld TTS-2 delivery_mode: STABLE | BALANCED | CREATIVE. null = BALANCED. */
  @Column({ name: 'delivery_mode', type: 'varchar', length: 32, nullable: true })
  deliveryMode!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => OrganizationAgent, (oa) => oa.agent)
  organizationAgents!: OrganizationAgent[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
