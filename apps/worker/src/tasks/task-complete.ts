import { z } from 'zod';
import type { SessionUserData } from '../tools/types.js';

/** LLM tools often send `null` for unused optional fields; `.optional()` rejects that. */
export const nullishString = z.string().nullish();

export function markTaskFinished(
  userData: SessionUserData,
  taskKey: string,
  result: Record<string, unknown>,
): void {
  userData.taskCompleted = true;
  userData.taskResult = { task: taskKey, ...result };
}
