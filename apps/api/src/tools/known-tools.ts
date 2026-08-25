/**
 * Tool IDs and task keys — owned by @call-agent/contracts.
 * API re-exports so existing module imports keep working.
 */
export {
  DEFAULT_TASK_KEY,
  isKnownTaskKey,
  isKnownToolId,
  KNOWN_TASK_KEYS,
  KNOWN_TOOL_IDS,
} from '@call-agent/contracts';
export type { KnownTaskKey, KnownToolId } from '@call-agent/contracts';
