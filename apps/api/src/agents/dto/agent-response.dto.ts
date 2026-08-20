import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgentDirection } from '../agent.entity';

export class AgentPromptDto {
  @ApiProperty({
    description:
      'Persona only: who the agent is, company, tone, policies, safety. Not workflow steps.',
  })
  systemPrompt!: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'LiveKit Agent onEnter generateReply instructions. null = built-in default; empty string = skip opening speech.',
  })
  onEnterInstructions!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Spoken closing line for onExit (session.say). null = built-in default; empty string = skip closing speech.',
  })
  onExitInstructions!: string | null;
}

export class AgentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: 'inbound',
    description:
      'Platform template key for templates; for org agents this is the template key (lineage). Prefer `slug` for org identity.',
  })
  key!: string;

  @ApiProperty({
    example: 'Inbound Call Agent',
    description:
      'Display name. For org agents this is the org-owned config name (not the template name).',
  })
  name!: string;

  @ApiPropertyOptional({
    example: 'booking-confirmations',
    description:
      'Present on org-owned agents: unique-per-org slug for this config.',
  })
  slug?: string;

  @ApiProperty({ enum: AgentDirection })
  direction!: AgentDirection;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: AgentPromptDto })
  prompt!: AgentPromptDto;

  @ApiProperty({
    example: 'general',
    nullable: true,
    description:
      'Inbound org agents and platform templates: default LiveKit task. Outbound org agents: always null (set task on the call or integration).',
  })
  defaultTaskKey!: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Tool profile controlling which worker tools are enabled',
  })
  toolProfileId!: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Present on org agents: linked Nylas calendar integration for calendar tools',
  })
  calendarIntegrationId?: string | null;

  @ApiPropertyOptional({
    type: [String],
    description: 'Resolved worker tool IDs from the tool profile',
  })
  enabledTools!: string[];

  @ApiPropertyOptional({ nullable: true })
  voice!: string | null;

  @ApiPropertyOptional({ nullable: true })
  model!: string | null;

  @ApiPropertyOptional({ nullable: true })
  temperature!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Inworld TTS speaking rate (0.5–1.5). null = worker / template default (1.0).',
  })
  speakingRate!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    enum: ['STABLE', 'BALANCED', 'CREATIVE'],
    description:
      'Inworld TTS-2 delivery mode. null = worker / template default (BALANCED). LLM temperature stays in `temperature`.',
  })
  deliveryMode!: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Present on org-owned agents: parent organization id',
  })
  organizationId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Present on org-owned agents: platform template id',
  })
  agentId?: string;

  @ApiPropertyOptional({
    example: 'outbound',
    description:
      'Present on org-owned agents: platform template key (same as `key` for org agents).',
  })
  templateKey?: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
