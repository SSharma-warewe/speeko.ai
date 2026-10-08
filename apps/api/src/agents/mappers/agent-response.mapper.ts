import { Agent } from '../agent.entity';
import { AgentResponseDto } from '../dto/agent-response.dto';
import { orgAgentDefaultTaskKey } from '../org-agent-task';
import { OrganizationAgent } from '../organization-agent.entity';
import { resolveVoiceRuntime } from '../voice-settings';
import {
  resolveTtsCacheEnabled,
  resolveTtsPreparedSpeechEnabled,
} from '@call-agent/contracts';

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
    defaultVoiceTaskId: agent.defaultVoiceTaskId ?? null,
    defaultTaskKey: agent.defaultTaskKey ?? 'general',
    toolProfileId: agent.defaultToolProfileId,
    enabledTools,
    voice: agent.voice,
    model: agent.model,
    ttsModel: agent.ttsModel ?? null,
    sttModel: agent.sttModel ?? null,
    speechLanguage: agent.speechLanguage ?? null,
    temperature: agent.temperature,
    speakingRate: agent.speakingRate,
    deliveryMode: agent.deliveryMode,
    ttsPreparedSpeechEnabled: agent.ttsPreparedSpeechEnabled ?? null,
    ttsPreparedSpeechDefaultEnabled: false,
    effectiveTtsPreparedSpeechEnabled: resolveTtsPreparedSpeechEnabled(
      agent.ttsPreparedSpeechEnabled,
      false,
      agent.model,
    ),
    ttsCacheEnabled: agent.ttsCacheEnabled ?? null,
    ttsCacheDefaultEnabled: false,
    effectiveTtsCacheEnabled: resolveTtsCacheEnabled(
      agent.ttsCacheEnabled,
      false,
      agent.model,
    ),
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
  const runtime = resolveVoiceRuntime(row, template);
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
    defaultVoiceTaskId: row.defaultVoiceTaskId ?? null,
    defaultTaskKey: orgAgentDefaultTaskKey(row, template),
    toolProfileId: row.toolProfileId,
    calendarIntegrationId: row.calendarIntegrationId ?? null,
    enabledTools,
    ...runtime,
    ttsPreparedSpeechEnabled: row.ttsPreparedSpeechEnabled ?? null,
    ttsPreparedSpeechDefaultEnabled: template.ttsPreparedSpeechEnabled === true,
    effectiveTtsPreparedSpeechEnabled: runtime.ttsPreparedSpeechEnabled,
    ttsCacheEnabled: row.ttsCacheEnabled ?? null,
    ttsCacheDefaultEnabled: template.ttsCacheEnabled === true,
    effectiveTtsCacheEnabled: runtime.ttsCacheEnabled,
    organizationId: row.organizationId,
    agentId: row.agentId,
    templateKey: template.key,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
