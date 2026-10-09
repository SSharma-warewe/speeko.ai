import type { VoiceTaskDefinition } from '@call-agent/contracts';

export function sentenceReferenced(
  definition: VoiceTaskDefinition,
  key: string,
): boolean {
  return (
    !!key &&
    (definition.phases.some((p) => p.sentenceKeys?.includes(key)) ||
      Object.values(definition.savedSpeech?.toolWaiting?.tools ?? {}).some(
        (c) => c.mode !== 'off' && c.sentenceKey === key,
      ) ||
      (['opening', 'closing'] as const).some((kind) => {
        const hook = definition.savedSpeech?.[kind];
        return hook?.mode === 'sentence' && hook.key === key;
      }))
  );
}

export function renameSentence(
  definition: VoiceTaskDefinition,
  from: string,
  to: string,
  sentenceIndex?: number,
): VoiceTaskDefinition {
  const speech = definition.savedSpeech;
  if (!speech) return definition;
  // An invalid duplicate is editable; its ambiguous references stay on the
  // existing key until the user explicitly changes them.
  const updateReferences =
    speech.sentences.filter((s) => s.key === from).length === 1;
  const hook = (kind: 'opening' | 'closing') => {
    const value = speech[kind];
    return updateReferences && value?.mode === 'sentence' && value.key === from
      ? { ...value, key: to }
      : value;
  };
  return {
    ...definition,
    phases: definition.phases.map((p) => ({
      ...p,
      ...(p.sentenceKeys
        ? {
            sentenceKeys: p.sentenceKeys.map((k) =>
              updateReferences && k === from ? to : k,
            ),
          }
        : {}),
    })),
    savedSpeech: {
      ...speech,
      ...(speech.toolWaiting
        ? {
            toolWaiting: {
              ...speech.toolWaiting,
              tools: Object.fromEntries(
                Object.entries(speech.toolWaiting.tools).map(([id, c]) => [
                  id,
                  updateReferences && c.mode !== 'off' && c.sentenceKey === from
                    ? { ...c, sentenceKey: to }
                    : c,
                ]),
              ),
            },
          }
        : {}),
      sentences: speech.sentences.map((s, i) =>
        (sentenceIndex === undefined ? s.key === from : i === sentenceIndex)
          ? { ...s, key: to }
          : s,
      ),
      opening: hook('opening'),
      closing: hook('closing'),
    },
  };
}
