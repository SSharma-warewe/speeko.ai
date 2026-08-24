/**
 * Runtime-only payload the worker reads from job metadata.
 * Persona prompt + tool IDs + task key + context. No executable code.
 */
export type AgentJobMetadata = {
  callId: string;
  organizationId?: string;
  agentKey: string;
  direction: string;
  medium?: string;
  /** LiveKit task key resolved by the worker TaskRegistry. */
  task: string;
  prompt: {
    systemPrompt: string;
    /** null = worker default; empty string = skip speech. */
    onEnterInstructions?: string | null;
    /** null = worker default; empty string = skip speech. */
    onExitInstructions?: string | null;
  };
  /** Worker ToolRegistry ids enabled for this call. */
  enabledTools: string[];
  context?: Record<string, unknown>;
  participantIdentity?: string;
  voice?: string | null;
  model?: string | null;
  temperature?: number | null;
  speakingRate?: number | null;
  deliveryMode?: string | null;
};
