import { Agent } from '../agent.entity';
import { AgentResponseDto } from '../dto/agent-response.dto';
import { OrganizationAgent } from '../organization-agent.entity';

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
    temperature: agent.temperature,
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
    defaultTaskKey: row.defaultTaskKey ?? template.defaultTaskKey ?? 'general',
    toolProfileId: row.toolProfileId,
    calendarIntegrationId: row.calendarIntegrationId ?? null,
    enabledTools,
    voice: row.voice ?? template.voice,
    model: row.model ?? template.model,
    temperature: row.temperature ?? template.temperature,
    organizationId: row.organizationId,
    agentId: row.agentId,
    templateKey: template.key,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
