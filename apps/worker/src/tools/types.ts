import type { ToolContextEntry } from '@livekit/agents';
import type { AgentJobMetadata } from '../job-metadata.js';

/** One worker tool invocation during a call (persisted via complete → sessionReport). */
export type ToolEvent = {
  at: string;
  toolId: string;
  args?: unknown;
  /** Sanitized tool return value (size-capped). */
  result?: unknown;
  ok?: boolean;
  error?: string;
  summary?: string;
  durationMs?: number;
};

export type SessionUserData = {
  callId?: string;
  organizationId?: string;
  taskKey?: string;
  context: Record<string, unknown>;
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
