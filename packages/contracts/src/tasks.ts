/**
 * LiveKit TaskRegistry keys. Metadata carries only the key;
 * the worker instantiates the task class.
 */
export const TASK_KEYS = {
  general: 'general',
  demoBooking: 'demo_booking',
  interviewBooking: 'interview_booking',
} as const;

export type KnownTaskKey = (typeof TASK_KEYS)[keyof typeof TASK_KEYS];

export const KNOWN_TASK_KEYS = [
  TASK_KEYS.general,
  TASK_KEYS.demoBooking,
  TASK_KEYS.interviewBooking,
] as const satisfies readonly KnownTaskKey[];

export const DEFAULT_TASK_KEY: KnownTaskKey = TASK_KEYS.general;

export function isKnownTaskKey(key: string): key is KnownTaskKey {
  return (KNOWN_TASK_KEYS as readonly string[]).includes(key);
}
