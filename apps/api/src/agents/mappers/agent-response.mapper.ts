import { Agent } from '../agent.entity';
import { AgentResponseDto } from '../dto/agent-response.dto';
import { orgAgentDefaultTaskKey } from '../org-agent-task';
import { OrganizationAgent } from '../organization-agent.entity';
import { resolveVoiceRuntime } from '../voice-settings';

export function toAgentTemplateResponse(
  agent: Agent,
  enabledTools: string[] = [],
): AgentResponseDto {
  return {
    id: agent.id,
    key: agent.key,
    name: agent.name,
    direction: agent.direction,
    description: agent.description,
    isActive: agent.isActive,
    prompt: {
      systemPrompt: agent.systemPrompt,
      onEnterInstructions: agent.onEnterInstructions ?? null,
      onExitInstructions: agent.onExitInstructions ?? null,
    },
    defaultTaskKey: agent.defaultTaskKey ?? 'general',
    toolProfileId: agent.defaultToolProfileId,
    enabledTools,
    voice: agent.voice,
    model: agent.model,
    ttsModel: agent.ttsModel ?? null,
    temperature: agent.temperature,
    speakingRate: agent.speakingRate,
    deliveryMode: agent.deliveryMode,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

export function toOrganizationAgentResponse(
  row: OrganizationAgent,
  enabledTools: string[] = [],
): AgentResponseDto {
  const template = row.agent;
  if (!template) {
    throw new Error(
      `OrganizationAgent ${row.id} loaded without agent relation`,
    );
  }
  return {
    id: row.id,
    key: template.key,
    name: row.name || template.name,
    slug: row.slug || template.key,
    direction: template.direction,
    description: template.description,
    isActive: row.isActive,
    prompt: {
      systemPrompt: row.systemPrompt,
      onEnterInstructions: row.onEnterInstructions ?? null,
      onExitInstructions: row.onExitInstructions ?? null,
    },
    defaultTaskKey: orgAgentDefaultTaskKey(row, template),
    toolProfileId: row.toolProfileId,
    calendarIntegrationId: row.calendarIntegrationId ?? null,
    enabledTools,
    ...resolveVoiceRuntime(row, template),
    organizationId: row.organizationId,
    agentId: row.agentId,
    templateKey: template.key,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
