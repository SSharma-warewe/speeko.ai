import type { ToolContextEntry } from '@livekit/agents';
import type { AgentJobMetadata, ToolEvent } from '@call-agent/contracts';
import type {
  InboundScriptStep,
  InboundServiceTrack,
} from '../tasks/inbound-service-tracks.js';
import type { TtsSynthesizer } from '../speech/tts-cache.js';

export type { ToolEvent };

export type SessionUserData = {
  callId?: string;
  organizationId?: string;
  taskKey?: string;
  context: Record<string, unknown>;
  /** First inbound list/sell/buy/rent branch; scripted reply runs once. */
  serviceTrack?: InboundServiceTrack;
  /** Inbound cached-script step after the service track (location → timing → BHK). */
  inboundScriptStep?: InboundScriptStep;
  /** Pipeline TTS instance for cached session.say (same object as AgentSession). */
  tts?: TtsSynthesizer;
  /** Structured result from the active LiveKit task. */
  taskResult?: Record<string, unknown> | null;
  /**
   * True only after task.run() resolves (complete_* was called).
   * Non-null taskResult is not enough — unanswered/crash paths also write one.
   */
  taskCompleted?: boolean;
  /** Tool calls during the session (calendar, hangup, stubs, task complete). */
  toolEvents?: ToolEvent[];
};

export type ToolFactoryContext = {
  meta: AgentJobMetadata;
  userData: SessionUserData;
};

/**
 * A registry entry may return a single tool, a Toolset, or several tools.
 * Implementations are hard-coded in the worker — never loaded from DB/metadata.
 */
export type ToolFactory = (
  ctx: ToolFactoryContext,
) => ToolContextEntry | ToolContextEntry[] | Promise<ToolContextEntry | ToolContextEntry[]>;
