import type { AgentDirection } from '../agent.js';
import type { DeliveryMode } from '../delivery.js';

export type AgentPrompt = {
  systemPrompt: string;
  /** null = built-in default; empty string = skip speech. */
  onEnterInstructions?: string | null;
  /** null = built-in default; empty string = skip speech. */
  onExitInstructions?: string | null;
};

export type Agent = {
  id: string;
  /** Platform template key (lineage). Prefer `slug` for org agent identity. */
  key: string;
  name: string;
  slug?: string;
  direction: AgentDirection;
  description: string | null;
  isActive: boolean;
  prompt: AgentPrompt;
  /** Inbound org agents + templates: default workflow. Outbound org agents: null. */
  defaultTaskKey: string | null;
  toolProfileId: string | null;
  calendarIntegrationId?: string | null;
  enabledTools: string[];
  voice: string | null;
  model: string | null;
  temperature: number | null;
  speakingRate?: number | null;
  deliveryMode?: DeliveryMode | null;
  organizationId?: string;
  agentId?: string;
  templateKey?: string;
  createdAt: string;
  updatedAt: string;
};

export type UpdateAgentTemplateRequest = {
  systemPrompt?: string;
  onEnterInstructions?: string | null;
  onExitInstructions?: string | null;
  defaultTaskKey?: string;
  defaultToolProfileId?: string;
  voice?: string | null;
  model?: string | null;
  temperature?: number | null;
  speakingRate?: number | null;
  deliveryMode?: DeliveryMode | null;
  isActive?: boolean;
};

export type AssignOrganizationAgentRequest = {
  agentId: string;
  name?: string;
  slug?: string;
  toolProfileId?: string;
  calendarIntegrationId?: string;
  defaultTaskKey?: string;
};

export type CloneOrganizationAgentRequest = {
  name: string;
  slug?: string;
};

export type UpdateOrganizationAgentRequest = {
  name?: string;
  slug?: string;
  systemPrompt?: string;
  onEnterInstructions?: string | null;
  onExitInstructions?: string | null;
  toolProfileId?: string;
  calendarIntegrationId?: string | null;
  defaultTaskKey?: string | null;
  voice?: string | null;
  model?: string | null;
  temperature?: number | null;
  speakingRate?: number | null;
  deliveryMode?: DeliveryMode | null;
  isActive?: boolean;
};
