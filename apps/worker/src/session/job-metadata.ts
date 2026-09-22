import {
  AgentDirection,
  CallMedium,
  isDeliveryMode,
  type AgentJobMetadata,
  type CompleteCallPayload,
} from '@call-agent/contracts';

export type { AgentJobMetadata, AgentJobPrompt } from '@call-agent/contracts';

const FALLBACK_SYSTEM = [
  'You are a helpful voice call agent representing the company.',
  'Keep replies short and clear for speech.',
  'Follow company policies and never invent facts.',
].join(' ');

//common function 
function parseDirection(value: unknown): AgentDirection {
  return value === AgentDirection.OUTBOUND
    ? AgentDirection.OUTBOUND
    : AgentDirection.INBOUND;
}
export class JobMeta{
  constructor (){}
   private parseMedium(value: unknown): CallMedium | undefined {
  if (value === CallMedium.WEB || value === CallMedium.SIP) {
    return value;
  }
  return undefined;
}
private parseHookField(
  value: unknown,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return value;
  return undefined;
}
 mergeInboundJobMetadata(
  dispatched: AgentJobMetadata,
  live: AgentJobMetadata,
): AgentJobMetadata {
  return {
    ...dispatched,
    ...live,
    callId: dispatched.callId,
    medium: dispatched.medium ?? live.medium,
    direction: dispatched.direction,
    participantIdentity: dispatched.participantIdentity,
    context: dispatched.context ?? live.context,
  };
}
  parseJobMetadata(raw: string | undefined | null): AgentJobMetadata {
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
      ttsModel: null,
      sttModel: null,
      speechLanguage: null,
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
      medium: this.parseMedium(parsed.medium),
      task:
        typeof parsed.task === 'string' && parsed.task.trim()
          ? parsed.task.trim()
          : 'general',
      prompt: {
        systemPrompt,
        onEnterInstructions: this.parseHookField(parsed.prompt?.onEnterInstructions),
        onExitInstructions: this.parseHookField(parsed.prompt?.onExitInstructions),
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
      ttsModel: typeof parsed.ttsModel === 'string' ? parsed.ttsModel : null,
      sttModel: typeof parsed.sttModel === 'string' ? parsed.sttModel : null,
      speechLanguage:
        typeof parsed.speechLanguage === 'string'
          ? parsed.speechLanguage
          : null,
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
      ttsModel: null,
      sttModel: null,
      speechLanguage: null,
      temperature: null,
      speakingRate: null,
      deliveryMode: null,
    };
  }
}

  /** Best-effort serialize LiveKit ChatContext / session.history. */
  serializeTranscript(history: {
    toJSON?: (opts?: { excludeTimestamp?: boolean }) => unknown;
    items?: unknown[];
  }): CompleteCallPayload['transcript'] {
    try {
      if (typeof history.toJSON === 'function') {
        const json = history.toJSON({ excludeTimestamp: false }) as {
          items?: Array<Record<string, unknown>>;
        };
        const items = Array.isArray(json?.items) ? json.items : [];
        return items
          .map((item) => {
            const role = String(item.role ?? item.type ?? 'unknown');
            let content = '';
            if (typeof item.content === 'string') {
              content = item.content;
            } else if (Array.isArray(item.content)) {
              content = item.content
                .map((c) => {
                  if (typeof c === 'string') return c;
                  if (c && typeof c === 'object' && 'text' in c) {
                    return String((c as { text: unknown }).text ?? '');
                  }
                  return '';
                })
                .filter(Boolean)
                .join(' ');
            } else if (typeof item.text === 'string') {
              content = item.text;
            }
            return {
              role,
              content,
              createdAt:
                typeof item.createdAt === 'number' ||
                typeof item.createdAt === 'string'
                  ? item.createdAt
                  : null,
              id: typeof item.id === 'string' ? item.id : undefined,
            };
          })
          .filter((m) => m.content.trim().length > 0 || m.role === 'assistant');
      }
    } catch (err) {
      console.warn('[agent] serializeTranscript failed', err);
    }
    return [];
  }

  serializeUsage(usage: {
    modelUsage?: unknown[];
  }): Record<string, unknown> | null {
    try {
      if (!usage) return null;
      return {
        models: Array.isArray(usage.modelUsage) ? usage.modelUsage : [],
      };
    } catch {
      return null;
    }
  }
}

/*JbMetadataService
│
├── parse()
│   └── JSON parsing + schema validation
│
├── mergeInbound()
│   └── Combine dispatched and live metadata
│
├── normalize()
│   └── Defaults + string cleanup + numeric ranges
│
└── createFallback()
    └── Development-only fallback



/**
 * Overlay live org-agent config onto the static inbound dispatch snapshot.
 * Ring-specific fields (callId, SIP identity, context) stay from the job.
 */

