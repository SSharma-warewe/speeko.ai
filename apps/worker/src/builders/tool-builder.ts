import type { ToolContextEntry } from '@livekit/agents';
import type { AgentJobMetadata } from '../job-metadata.js';
import { ToolRegistry } from '../tools/registry.js';
import type { SessionUserData } from '../tools/types.js';

/**
 * Resolve enabled tool IDs from metadata into concrete LiveKit tools.
 */
export async function buildTools(
  meta: AgentJobMetadata,
  userData: SessionUserData,
): Promise<ToolContextEntry[]> {
  return ToolRegistry.resolve(meta.enabledTools, { meta, userData });
}
