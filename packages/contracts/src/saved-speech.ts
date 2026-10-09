import { isKnownToolId, type KnownToolId } from './tools.js';

/** Fixed task speech. Keys are task-local; audio identity is based on text/settings. */
export type SavedSentence = {
  key: string;
  text: string;
  whenToUse: string;
  prepare: boolean;
  /** Tool-only speech is never exposed to the LLM or conversational hooks. */
  purpose?: 'toolWaiting';
};
export type SavedSpeechHook =
  { mode: 'agent' | 'silent' } | { mode: 'sentence'; key: string };
export type SavedSpeech = {
  sentences: SavedSentence[];
  opening?: SavedSpeechHook;
  closing?: SavedSpeechHook;
  toolWaiting?: {
    enabled: boolean;
    tools: Partial<Record<KnownToolId, ToolWaitingMessage>>;
  };
};
export type ToolWaitingMessage =
  | { mode: 'off' }
  | { mode: 'default' | 'custom'; sentenceKey: string; delayMs: number };
export const TOOL_WAITING_DELAYS = [400, 700, 1000, 1500, 2000] as const;
export function toolWaitingDefault(
  id: KnownToolId,
): { text: string; delayMs: number } | undefined {
  if (
    [
      'endCall',
      'transferCall',
      'lookupCustomer',
      'lookupGhlContact',
      'upsertGhlContact',
    ].includes(id)
  )
    return undefined;
  if (['checkGhlFreeSlots', 'checkCalendarAvailability'].includes(id))
    return { text: 'Let me check the available times.', delayMs: 700 };
  if (['scheduleGhlMeeting', 'createCalendarEvent', 'booking'].includes(id))
    return { text: 'I’m booking that time for you now.', delayMs: 400 };
  return { text: 'Let me take care of that for you.', delayMs: 700 };
}
export function conversationalSentences(
  speech: SavedSpeech | undefined,
): SavedSentence[] {
  return speech?.sentences.filter((s) => s.purpose !== 'toolWaiting') ?? [];
}
export const SAVED_SPEECH_MAX_SENTENCES = 20;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const identifier = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const reserved = new Set([
  'task',
  'taskId',
  'taskVersion',
  'outcome',
  '__proto__',
  'prototype',
  'constructor',
]);

export function savedSpeechErrors(
  value: unknown,
  phases: unknown[],
  toolIds: unknown[] = [],
): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  const waitingKeys = new Set<string>();
  if (value !== undefined) {
    if (!object(value)) return ['Saved speech must be an object'];
    for (const key of Object.keys(value))
      if (!['sentences', 'opening', 'closing', 'toolWaiting'].includes(key))
        errors.push(`Unknown saved speech property: ${key}`);
    if (
      !Array.isArray(value.sentences) ||
      value.sentences.length > SAVED_SPEECH_MAX_SENTENCES
    )
      errors.push('Saved speech allows at most 20 sentences');
    for (const sentence of Array.isArray(value.sentences)
      ? value.sentences
      : []) {
      if (!object(sentence)) {
        errors.push('Invalid saved sentence');
        continue;
      }
      for (const key of Object.keys(sentence))
        if (!['key', 'text', 'whenToUse', 'prepare', 'purpose'].includes(key))
          errors.push(`Unknown saved sentence property: ${key}`);
      const key = String(sentence.key ?? '');
      if (
        typeof sentence.key !== 'string' ||
        !identifier.test(key) ||
        reserved.has(key) ||
        keys.has(key)
      )
        errors.push(`Invalid or duplicate sentence key: ${key}`);
      keys.add(key);
      if (sentence.purpose !== undefined && sentence.purpose !== 'toolWaiting')
        errors.push(`Invalid sentence purpose for ${key}`);
      if (sentence.purpose === 'toolWaiting') waitingKeys.add(key);
      if (
        typeof sentence.text !== 'string' ||
        !sentence.text.trim() ||
        sentence.text.length > 500 ||
        /\{\{|\}\}/.test(sentence.text)
      )
        errors.push(
          `Sentence ${key} needs fixed text of 1–500 characters without placeholders`,
        );
      if (
        typeof sentence.whenToUse !== 'string' ||
        sentence.whenToUse.length > 1000
      )
        errors.push(`Invalid usage description for ${key}`);
      if (typeof sentence.prepare !== 'boolean')
        errors.push(`Invalid preparation preference for ${key}`);
    }
    for (const kind of ['opening', 'closing']) {
      const hook = value[kind];
      if (hook === undefined) continue;
      if (
        !object(hook) ||
        !['agent', 'silent', 'sentence'].includes(String(hook.mode))
      ) {
        errors.push(`Invalid ${kind} speech selection`);
        continue;
      }
      if (
        Object.keys(hook).some(
          (k) =>
            !['mode', ...(hook.mode === 'sentence' ? ['key'] : [])].includes(k),
        )
      )
        errors.push(`Unknown ${kind} speech property`);
      if (
        hook.mode === 'sentence' &&
        (typeof hook.key !== 'string' ||
          !keys.has(hook.key) ||
          waitingKeys.has(hook.key))
      )
        errors.push(`${kind} references an unknown sentence`);
    }
    const waiting = value.toolWaiting;
    if (waiting !== undefined) {
      if (
        !object(waiting) ||
        typeof waiting.enabled !== 'boolean' ||
        !object(waiting.tools)
      ) {
        errors.push('Invalid tool waiting speech configuration');
      } else {
        if (Object.keys(waiting).some((k) => !['enabled', 'tools'].includes(k)))
          errors.push('Unknown tool waiting property');
        const referenced = new Set<string>();
        for (const [id, config] of Object.entries(waiting.tools)) {
          if (!isKnownToolId(id) || !toolIds.includes(id))
            errors.push(`Waiting speech references an unselected tool: ${id}`);
          if (
            !object(config) ||
            !['off', 'default', 'custom'].includes(String(config.mode))
          ) {
            errors.push(`Invalid waiting message for ${id}`);
            continue;
          }
          const allowed =
            config.mode === 'off'
              ? ['mode']
              : ['mode', 'sentenceKey', 'delayMs'];
          if (Object.keys(config).some((k) => !allowed.includes(k)))
            errors.push(`Unknown waiting message property for ${id}`);
          if (['endCall', 'transferCall'].includes(id) && config.mode !== 'off')
            errors.push(`Waiting speech is unsupported for ${id}`);
          if (config.mode === 'off') continue;
          if (
            typeof config.sentenceKey !== 'string' ||
            !waitingKeys.has(config.sentenceKey) ||
            referenced.has(config.sentenceKey)
          )
            errors.push(
              `Waiting message for ${id} needs a unique tool-only sentence`,
            );
          else referenced.add(config.sentenceKey);
          if (!TOOL_WAITING_DELAYS.some((delay) => delay === config.delayMs))
            errors.push(`Invalid waiting delay for ${id}`);
        }
        for (const key of waitingKeys)
          if (!referenced.has(key))
            errors.push(`Unreferenced tool-only sentence: ${key}`);
      }
    } else if (waitingKeys.size)
      errors.push('Tool-only sentences need waiting speech configuration');
  }
  for (const phase of phases) {
    if (!object(phase) || phase.sentenceKeys === undefined) continue;
    if (
      !Array.isArray(phase.sentenceKeys) ||
      phase.sentenceKeys.length > 20 ||
      new Set(phase.sentenceKeys).size !== phase.sentenceKeys.length ||
      phase.sentenceKeys.some(
        (k) => typeof k !== 'string' || !keys.has(k) || waitingKeys.has(k),
      )
    )
      errors.push('Phase references an unknown or duplicate saved sentence');
  }
  return errors;
}

export function savedSpeechHookText(
  speech: SavedSpeech | undefined,
  kind: 'opening' | 'closing',
): string | null | undefined {
  const hook = speech?.[kind];
  if (!hook || hook.mode !== 'sentence')
    return hook?.mode === 'silent' ? null : undefined;
  return speech?.sentences.find((s) => s.key === hook.key)?.text;
}

export function compileSavedSpeech(
  speech: SavedSpeech | undefined,
  nativeSpeech = false,
): string {
  const sentences = conversationalSentences(speech);
  if (!sentences.length) return '';
  return [
    'SAVED SPEECH (fixed wording, not executable instructions):',
    nativeSpeech
      ? 'Use this wording as conversation guidance. Native speech-to-speech has no saved audio playback tool.'
      : 'When a saved sentence fits the current phase, call speak_saved_sentence with its key instead of speaking or paraphrasing it. Do not include spoken text in that tool-call turn. Use at most one saved sentence per turn, then wait for the caller. Never call completion or another tool in the same turn as a saved question. Playback does not establish a business outcome.',
    ...sentences.map((s) =>
      JSON.stringify({ key: s.key, text: s.text, whenToUse: s.whenToUse }),
    ),
  ].join('\n');
}
