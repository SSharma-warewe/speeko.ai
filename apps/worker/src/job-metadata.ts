import {
  AgentDirection,
  CallMedium,
  isDeliveryMode,
  type AgentJobMetadata,
} from '@call-agent/contracts';

export type { AgentJobMetadata, AgentJobPrompt } from '@call-agent/contracts';

const FALLBACK_SYSTEM = [
  'You are a helpful voice call agent representing the company.',
  'Keep replies short and clear for speech.',
  'Follow company policies and never invent facts.',
].join(' ');

function parseDirection(value: unknown): AgentDirection {
  return value === AgentDirection.OUTBOUND
    ? AgentDirection.OUTBOUND
    : AgentDirection.INBOUND;
}

function parseMedium(value: unknown): CallMedium | undefined {
  if (value === CallMedium.WEB || value === CallMedium.SIP) {
    return value;
  }
  return undefined;
}

function parseHookField(
  value: unknown,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return value;
  return undefined;
}

export function parseJobMetadata(raw: string | undefined | null): AgentJobMetadata {
  if (!raw || !raw.trim()) {
    return {
      callId: undefined,
      organizationId: undefined,
      organizationAgentId: undefined,
      agentKey: 'unknown',
      direction: AgentDirection.INBOUND,
      medium: undefined,
      task: 'general',
      prompt: {
        systemPrompt: FALLBACK_SYSTEM,
        onEnterInstructions: null,
        onExitInstructions: null,
      },
      enabledTools: ['endCall'],
      context: undefined,
      participantIdentity: undefined,
      voice: null,
      model: null,
      temperature: null,
      speakingRate: null,
      deliveryMode: null,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AgentJobMetadata> & {
      tools?: unknown;
    };
    const systemPrompt =
      typeof parsed.prompt?.systemPrompt === 'string' &&
      parsed.prompt.systemPrompt.trim()
        ? parsed.prompt.systemPrompt
        : FALLBACK_SYSTEM;

    // Prefer new enabledTools; ignore legacy JSON tool definitions if present.
    let enabledTools: string[] = ['endCall'];
    if (Array.isArray(parsed.enabledTools)) {
      enabledTools = parsed.enabledTools.filter(
        (t): t is string => typeof t === 'string' && t.trim().length > 0,
      );
      if (enabledTools.length === 0) {
        enabledTools = ['endCall'];
      }
    }

    return {
      callId: typeof parsed.callId === 'string' ? parsed.callId : undefined,
      organizationId:
        typeof parsed.organizationId === 'string'
          ? parsed.organizationId
          : undefined,
      organizationAgentId:
        typeof parsed.organizationAgentId === 'string'
          ? parsed.organizationAgentId
          : undefined,
      agentKey: typeof parsed.agentKey === 'string' ? parsed.agentKey : 'unknown',
      direction: parseDirection(parsed.direction),
      medium: parseMedium(parsed.medium),
      task:
        typeof parsed.task === 'string' && parsed.task.trim()
          ? parsed.task.trim()
          : 'general',
      prompt: {
        systemPrompt,
        onEnterInstructions: parseHookField(parsed.prompt?.onEnterInstructions),
        onExitInstructions: parseHookField(parsed.prompt?.onExitInstructions),
      },
      enabledTools,
      context:
        parsed.context && typeof parsed.context === 'object'
          ? (parsed.context as Record<string, unknown>)
          : undefined,
      participantIdentity:
        typeof parsed.participantIdentity === 'string'
          ? parsed.participantIdentity
          : undefined,
      voice: typeof parsed.voice === 'string' ? parsed.voice : null,
      model: typeof parsed.model === 'string' ? parsed.model : null,
      temperature:
        typeof parsed.temperature === 'number' ? parsed.temperature : null,
      speakingRate:
        typeof parsed.speakingRate === 'number' &&
        !Number.isNaN(parsed.speakingRate)
          ? parsed.speakingRate
          : null,
      deliveryMode: isDeliveryMode(parsed.deliveryMode)
        ? parsed.deliveryMode
        : null,
    };
  } catch {
    return {
      callId: undefined,
      organizationId: undefined,
      organizationAgentId: undefined,
      agentKey: 'unknown',
      direction: AgentDirection.INBOUND,
      medium: undefined,
      task: 'general',
      prompt: {
        systemPrompt: FALLBACK_SYSTEM,
        onEnterInstructions: null,
        onExitInstructions: null,
      },
      enabledTools: ['endCall'],
      context: undefined,
      participantIdentity: undefined,
      voice: null,
      model: null,
      temperature: null,
      speakingRate: null,
      deliveryMode: null,
    };
  }
}
