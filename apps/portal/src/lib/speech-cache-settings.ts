import { isRealtimeLlmModel, resolveTtsPreparedSpeechEnabled } from '@call-agent/contracts';

/** Keep inheritance distinct from an explicit off when editing/saving. */
export function speechCacheSelection(value: boolean | null): string {
  return value === null ? 'default' : value ? 'on' : 'off';
}

export function speechCachePreference(value: string): boolean | null {
  return value === 'on' ? true : value === 'off' ? false : null;
}

/** Shared by template, admin organization, and user organization editors. */
export function openingSpeechHint(
  preference: boolean | null,
  defaultEnabled: boolean,
  model?: string | null,
): string {
  const behavior = isRealtimeLlmModel(model)
    ? 'Enter instructions for the model to generate the greeting. Prepared opening playback is unavailable for native speech-to-speech models.'
    : resolveTtsPreparedSpeechEnabled(preference, defaultEnabled, model)
    ? 'Prepared sentences is On: enter the exact words to speak. The saved opening plays verbatim without a model-generated greeting.'
    : 'Enter instructions for the model to generate the greeting. Turn Prepared sentences On to speak the saved text exactly.';
  return `${behavior} Leave empty for the built-in greeting or select Silent to skip. A task-defined sentence or silent opening takes priority.`;
}
