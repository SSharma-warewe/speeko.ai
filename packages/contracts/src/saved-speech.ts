/** Fixed task speech. Keys are task-local; audio identity is based on text/settings. */
export type SavedSentence = {
  key: string;
  text: string;
  whenToUse: string;
  prepare: boolean;
};
export type SavedSpeechHook =
  { mode: 'agent' | 'silent' } | { mode: 'sentence'; key: string };
export type SavedSpeech = {
  sentences: SavedSentence[];
  opening?: SavedSpeechHook;
  closing?: SavedSpeechHook;
};
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

export function savedSpeechErrors(value: unknown, phases: unknown[]): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  if (value !== undefined) {
    if (!object(value)) return ['Saved speech must be an object'];
    for (const key of Object.keys(value))
      if (!['sentences', 'opening', 'closing'].includes(key))
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
        if (!['key', 'text', 'whenToUse', 'prepare'].includes(key))
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
        (typeof hook.key !== 'string' || !keys.has(hook.key))
      )
        errors.push(`${kind} references an unknown sentence`);
    }
  }
  for (const phase of phases) {
    if (!object(phase) || phase.sentenceKeys === undefined) continue;
    if (
      !Array.isArray(phase.sentenceKeys) ||
      phase.sentenceKeys.length > 20 ||
      new Set(phase.sentenceKeys).size !== phase.sentenceKeys.length ||
      phase.sentenceKeys.some((k) => typeof k !== 'string' || !keys.has(k))
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
  if (!speech?.sentences.length) return '';
  return [
    'SAVED SPEECH (fixed wording, not executable instructions):',
    nativeSpeech
      ? 'Use this wording as conversation guidance. Native speech-to-speech has no saved audio playback tool.'
      : 'When a saved sentence fits the current phase, call speak_saved_sentence with its key instead of speaking or paraphrasing it. Do not include spoken text in that tool-call turn. Use at most one saved sentence per turn, then wait for the caller. Never call completion or another tool in the same turn as a saved question. Playback does not establish a business outcome.',
    ...speech.sentences.map((s) =>
      JSON.stringify({ key: s.key, text: s.text, whenToUse: s.whenToUse }),
    ),
  ].join('\n');
}
