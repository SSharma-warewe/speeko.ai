import type { AgentDirection } from './agent.js';
import type { CallMedium } from './call.js';
import type { DeliveryMode } from './delivery.js';

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
 * Runtime-only dispatch metadata packed by the API and parsed by the worker.
 * No executable code. Persona = prompt.systemPrompt; workflow = task;
 * capabilities = enabledTools.
 *
 * Inbound SIP dispatch has no unique callId (static at publish). The worker
 * upserts a calls row and then uses the returned id on complete.
 */
export type AgentJobMetadata = {
  callId?: string;
  organizationId?: string;
  organizationAgentId?: string;
  agentKey: string;
  direction: AgentDirection;
  medium?: CallMedium;
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
  /** Inworld TTS speaking_rate (0.5–1.5). */
  speakingRate?: number | null;
  /** Inworld TTS-2 delivery_mode. */
  deliveryMode?: DeliveryMode | null;
};
