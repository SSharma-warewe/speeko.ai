import type { AgentJobMetadata, CallMedium } from '@call-agent/contracts';
import type { AgentDirection } from '@call-agent/contracts';
import { OrganizationAgent } from './organization-agent.entity';
import { resolveVoiceRuntime } from './voice-settings';

/** Pack org-agent persona + tools + voice for LiveKit job metadata. */
export function packOrgAgentJobMetadata(
  orgAgent: OrganizationAgent,
  extras: {
    task: string;
    enabledTools: string[];
    direction: AgentDirection;
    medium: CallMedium;
    callId?: string;
    context?: Record<string, unknown>;
    participantIdentity?: string;
  },
): AgentJobMetadata {
  const template = orgAgent.agent;
  return {
    ...(extras.callId ? { callId: extras.callId } : {}),
    organizationId: orgAgent.organizationId,
    organizationAgentId: orgAgent.id,
    agentKey: template.key,
    direction: extras.direction,
    medium: extras.medium,
    task: extras.task,
    prompt: {
      systemPrompt: orgAgent.systemPrompt,
      onEnterInstructions: orgAgent.onEnterInstructions ?? null,
      onExitInstructions: orgAgent.onExitInstructions ?? null,
    },
    enabledTools: extras.enabledTools,
    ...(extras.context !== undefined ? { context: extras.context } : {}),
    ...(extras.participantIdentity
      ? { participantIdentity: extras.participantIdentity }
      : {}),
    ...resolveVoiceRuntime(orgAgent, template),
  };
}
