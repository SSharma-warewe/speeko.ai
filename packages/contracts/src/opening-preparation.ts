import type { AgentJobMetadata } from './job-metadata.js';
import { isRealtimeLlmModel } from './llm.js';
import { savedSpeechHookText } from './saved-speech.js';

export const OPENING_PREPARATION_ATTRIBUTE = 'speeko.openingPreparation';
export const OPENING_PREPARATION_TIMEOUT_MS = 30_000;
export type OpeningPreparation = {
  version: 1;
  attemptId: string;
  deadline: number;
};
export type OpeningPreparationReport = {
  version: 1;
  attemptId: string;
  status: 'preparing' | 'ready' | 'failed';
  usage: { models: unknown[] };
};

/** Exact finite opening; undefined preserves generated opening semantics. */
export function resolveExactOpening(
  meta: AgentJobMetadata,
): string | null | undefined {
  if (isRealtimeLlmModel(meta.model)) return undefined;
  const saved = savedSpeechHookText(
    meta.voiceTask?.definition.savedSpeech,
    'opening',
  );
  if (saved !== undefined) return saved;
  const custom = meta.prompt.onEnterInstructions;
  if (custom === '') return null;
  if (
    meta.ttsPreparedSpeechEnabled === true &&
    typeof custom === 'string' &&
    custom.trim()
  )
    return custom;
  return undefined;
}

export function requiresOpeningPreparation(meta: AgentJobMetadata): boolean {
  return (
    meta.direction === 'outbound' &&
    meta.medium === 'sip' &&
    meta.ttsPreparedSpeechEnabled === true &&
    typeof resolveExactOpening(meta) === 'string'
  );
}

export function isOpeningPreparation(
  value: unknown,
): value is OpeningPreparation {
  const v = value as OpeningPreparation | undefined;
  return (
    !!v &&
    v.version === 1 &&
    typeof v.attemptId === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      v.attemptId,
    ) &&
    Number.isFinite(v.deadline) &&
    v.deadline > 0
  );
}
