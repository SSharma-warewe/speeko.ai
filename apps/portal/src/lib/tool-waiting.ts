import {
  toolWaitingDefault,
  type KnownToolId,
  type ToolWaitingMessage,
  type VoiceTaskDefinition,
} from '@call-agent/contracts';

export function setToolWaitingMessage(
  definition: VoiceTaskDefinition,
  id: KnownToolId,
  mode: ToolWaitingMessage['mode'],
  changes: { text?: string; delayMs?: number } = {},
): VoiceTaskDefinition {
  const speech = definition.savedSpeech ?? { sentences: [] };
  const waiting = speech.toolWaiting ?? { enabled: false, tools: {} };
  const previous = waiting.tools[id];
  const oldKey =
    previous && previous.mode !== 'off' ? previous.sentenceKey : undefined;
  const oldSentence = speech.sentences.find((s) => s.key === oldKey);
  const sentences = speech.sentences.filter((s) => s.key !== oldKey);
  let config: ToolWaitingMessage = { mode: 'off' };
  if (mode !== 'off') {
    const recommended = toolWaitingDefault(id) ?? {
      text: 'Let me take care of that for you.',
      delayMs: 700,
    };
    let key = oldKey ?? `waiting_${id}`;
    let suffix = 1;
    while (sentences.some((s) => s.key === key))
      key = `waiting_${id}_${suffix++}`;
    sentences.push({
      key,
      text:
        changes.text ??
        (mode === 'default' && previous?.mode !== 'default'
          ? recommended.text
          : (oldSentence?.text ?? recommended.text)),
      whenToUse: '',
      prepare: true,
      purpose: 'toolWaiting',
    });
    config = {
      mode,
      sentenceKey: key,
      delayMs:
        changes.delayMs ??
        (previous && previous.mode !== 'off'
          ? previous.delayMs
          : recommended.delayMs),
    };
  }
  return {
    ...definition,
    savedSpeech: {
      ...speech,
      sentences,
      toolWaiting: { ...waiting, tools: { ...waiting.tools, [id]: config } },
    },
  };
}

export function syncToolWaiting(
  definition: VoiceTaskDefinition,
): VoiceTaskDefinition {
  const waiting = definition.savedSpeech?.toolWaiting;
  if (!waiting) return definition;
  let next = definition;
  for (const id of Object.keys(waiting.tools) as KnownToolId[]) {
    if (!definition.toolIds.includes(id)) {
      next = setToolWaitingMessage(next, id, 'off');
      delete next.savedSpeech!.toolWaiting!.tools[id];
    }
  }
  if (waiting.enabled)
    for (const id of definition.toolIds) {
      if (!next.savedSpeech!.toolWaiting!.tools[id])
        next = setToolWaitingMessage(
          next,
          id,
          toolWaitingDefault(id) ? 'default' : 'off',
        );
    }
  return next;
}

export function enableToolWaiting(
  definition: VoiceTaskDefinition,
  enabled: boolean,
): VoiceTaskDefinition {
  const speech = definition.savedSpeech ?? { sentences: [] };
  return syncToolWaiting({
    ...definition,
    savedSpeech: {
      ...speech,
      toolWaiting: { tools: {}, ...speech.toolWaiting, enabled },
    },
  });
}
