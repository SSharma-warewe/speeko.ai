export type AgentJobPrompt = {
  systemPrompt: string;
  /**
   * LiveKit onEnter generateReply instructions.
   * undefined/null = built-in default; empty string = skip opening speech.
   */
  onEnterInstructions?: string | null;
  /**
   * Spoken closing line for LiveKit onExit (`session.say`).
   * undefined/null = built-in default; empty string = skip closing speech.
   */
  onExitInstructions?: string | null;
};

/**
 * Runtime-only dispatch metadata. No executable code.
 * Persona = prompt.systemPrompt; hooks = onEnter/onExit; workflow = task; capabilities = enabledTools.
 */
export type AgentJobMetadata = {
  callId?: string;
  organizationId?: string;
  agentKey: string;
  direction: string;
  /** `web` | `sip` when provided by the API. */
  medium?: string;
  /** LiveKit TaskRegistry key. */
  task: string;
  prompt: AgentJobPrompt;
  /** Worker ToolRegistry ids. */
  enabledTools: string[];
  /** Free-form runtime context (CRM fields, booking details, etc.). */
  context?: Record<string, unknown>;
  participantIdentity?: string;
  voice?: string | null;
  model?: string | null;
  temperature?: number | null;
};

const FALLBACK_SYSTEM = [
  'You are a helpful voice call agent representing the company.',
  'Keep replies short and clear for speech.',
  'Follow company policies and never invent facts.',
].join(' ');

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
      agentKey: 'unknown',
      direction: 'inbound',
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
      agentKey: typeof parsed.agentKey === 'string' ? parsed.agentKey : 'unknown',
      direction:
        typeof parsed.direction === 'string' ? parsed.direction : 'inbound',
      medium: typeof parsed.medium === 'string' ? parsed.medium : undefined,
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
    };
  } catch {
    return {
      callId: undefined,
      organizationId: undefined,
      agentKey: 'unknown',
      direction: 'inbound',
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
    };
  }
}
