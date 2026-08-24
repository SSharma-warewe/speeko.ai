import { Logger } from '@nestjs/common';
import { DEFAULT_TASK_KEY, isKnownTaskKey } from '../../tools/known-tools';

export function resolveTaskKey(
  logger: Pick<Logger, 'warn'>,
  requested?: string | null,
  ...fallbacks: Array<string | null | undefined>
): string {
  const candidates = [requested, ...fallbacks, DEFAULT_TASK_KEY];
  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.trim()) {
      const key = raw.trim();
      if (!isKnownTaskKey(key)) {
        // Allow forward-compatible custom keys registered only in the worker.
        logger.warn(`Unknown task key (passing through): ${key}`);
      }
      return key;
    }
  }
  return DEFAULT_TASK_KEY;
}
