/**
 * LLM + realtime-model catalog for agent config.
 * `model` on agents is this catalog (null = Gemma via LiveKit Inference).
 * Speech-to-speech realtime ids live here (`kind: 'realtime'`); TTS stays on `ttsModel`.
 */

import type { TtsVoiceOption } from './tts.js';
import { GROK_VOICES, isVoiceAllowed } from './tts.js';

export const LLM_KINDS = ['llm', 'realtime'] as const;
export type LlmKind = (typeof LLM_KINDS)[number];

export const LLM_BACKENDS = [
  'livekit-inference',
  'openai-plugin',
  'xai-plugin',
] as const;
export type LlmBackend = (typeof LLM_BACKENDS)[number];

export const LLM_MODEL_IDS = {
  gemma431b: 'google/gemma-4-31b-it',
  gpt41Mini: 'openai/gpt-4.1-mini',
  gpt41: 'openai/gpt-4.1',
  gpt5Mini: 'openai/gpt-5-mini',
  gpt5: 'openai/gpt-5',
  grok46: 'xai/grok-4.6',
  grok43: 'xai/grok-4.3',
  gptRealtime21: 'openai/gpt-realtime-2.1',
  gptRealtime21Mini: 'openai/gpt-realtime-2.1-mini',
  grokVoice20: 'xai/grok-voice-think-fast-2.0',
} as const;

export type LlmModelId = (typeof LLM_MODEL_IDS)[keyof typeof LLM_MODEL_IDS];

export const KNOWN_LLM_MODEL_IDS = [
  LLM_MODEL_IDS.gemma431b,
  LLM_MODEL_IDS.gpt41Mini,
  LLM_MODEL_IDS.gpt41,
  LLM_MODEL_IDS.gpt5Mini,
  LLM_MODEL_IDS.gpt5,
  LLM_MODEL_IDS.grok46,
  LLM_MODEL_IDS.grok43,
  LLM_MODEL_IDS.gptRealtime21,
  LLM_MODEL_IDS.gptRealtime21Mini,
  LLM_MODEL_IDS.grokVoice20,
] as const satisfies readonly LlmModelId[];

export const DEFAULT_LLM_MODEL_ID = LLM_MODEL_IDS.gemma431b;

export const LLM_MODEL_ALIASES: Record<string, LlmModelId> = {
  'google/gemma-4-31b-it': LLM_MODEL_IDS.gemma431b,
  'gemma-4-31b-it': LLM_MODEL_IDS.gemma431b,
  'gemma-4-31b': LLM_MODEL_IDS.gemma431b,
  'openai/gpt-4.1-mini': LLM_MODEL_IDS.gpt41Mini,
  'gpt-4.1-mini': LLM_MODEL_IDS.gpt41Mini,
  'openai/gpt-4.1': LLM_MODEL_IDS.gpt41,
  'gpt-4.1': LLM_MODEL_IDS.gpt41,
  'openai/gpt-5-mini': LLM_MODEL_IDS.gpt5Mini,
  'gpt-5-mini': LLM_MODEL_IDS.gpt5Mini,
  'openai/gpt-5': LLM_MODEL_IDS.gpt5,
  'gpt-5': LLM_MODEL_IDS.gpt5,
  'xai/grok-4.6': LLM_MODEL_IDS.grok46,
  'grok-4.6': LLM_MODEL_IDS.grok46,
  'xai/grok-4.3': LLM_MODEL_IDS.grok43,
  'grok-4.3': LLM_MODEL_IDS.grok43,
  'openai/gpt-realtime-2.1': LLM_MODEL_IDS.gptRealtime21,
  'gpt-realtime-2.1': LLM_MODEL_IDS.gptRealtime21,
  'openai/gpt-realtime-2.1-mini': LLM_MODEL_IDS.gptRealtime21Mini,
  'gpt-realtime-2.1-mini': LLM_MODEL_IDS.gptRealtime21Mini,
  'xai/grok-voice-think-fast-2.0': LLM_MODEL_IDS.grokVoice20,
  'grok-voice-think-fast-2.0': LLM_MODEL_IDS.grokVoice20,
  'grok-voice-latest': LLM_MODEL_IDS.grokVoice20,
  'xai/grok-voice-latest': LLM_MODEL_IDS.grokVoice20,
};

const OPENAI_REALTIME_VOICES: readonly TtsVoiceOption[] = [
  { id: 'marin', name: 'Marin', line: 'Recommended', initial: 'M', featured: true },
  { id: 'cedar', name: 'Cedar', line: 'Warm', initial: 'C', featured: true },
  { id: 'alloy', name: 'Alloy', line: 'Neutral', initial: 'A', featured: true },
  { id: 'ash', name: 'Ash', line: 'Clear', initial: 'S' },
  { id: 'ballad', name: 'Ballad', line: 'Warm', initial: 'B' },
  { id: 'coral', name: 'Coral', line: 'Bright', initial: 'O' },
  { id: 'echo', name: 'Echo', line: 'Even', initial: 'E' },
  { id: 'sage', name: 'Sage', line: 'Calm', initial: 'G' },
  { id: 'shimmer', name: 'Shimmer', line: 'Light', initial: 'H' },
  { id: 'verse', name: 'Verse', line: 'Expressive', initial: 'V' },
];

export type LlmModelSpec = {
  id: LlmModelId;
  label: string;
  shortLabel: string;
  kind: LlmKind;
  backend: LlmBackend;
  /** Id sent to LiveKit Inference or the provider plugin. */
  runtimeModel: string;
  defaultVoice: string | null;
  voices: readonly TtsVoiceOption[];
  controls: {
    temperature: boolean;
  };
};

export const LLM_MODELS: Record<LlmModelId, LlmModelSpec> = {
  [LLM_MODEL_IDS.gemma431b]: {
    id: LLM_MODEL_IDS.gemma431b,
    label: 'Gemma 4 31B',
    shortLabel: 'Gemma',
    kind: 'llm',
    backend: 'livekit-inference',
    runtimeModel: LLM_MODEL_IDS.gemma431b,
    defaultVoice: null,
    voices: [],
    controls: { temperature: true },
  },
  [LLM_MODEL_IDS.gpt41Mini]: {
    id: LLM_MODEL_IDS.gpt41Mini,
    label: 'GPT-4.1 mini',
    shortLabel: '4.1 mini',
    kind: 'llm',
    backend: 'openai-plugin',
    runtimeModel: 'gpt-4.1-mini',
    defaultVoice: null,
    voices: [],
    controls: { temperature: true },
  },
  [LLM_MODEL_IDS.gpt41]: {
    id: LLM_MODEL_IDS.gpt41,
    label: 'GPT-4.1',
    shortLabel: '4.1',
    kind: 'llm',
    backend: 'openai-plugin',
    runtimeModel: 'gpt-4.1',
    defaultVoice: null,
    voices: [],
    controls: { temperature: true },
  },
  [LLM_MODEL_IDS.gpt5Mini]: {
    id: LLM_MODEL_IDS.gpt5Mini,
    label: 'GPT-5 mini',
    shortLabel: '5 mini',
    kind: 'llm',
    backend: 'openai-plugin',
    runtimeModel: 'gpt-5-mini',
    defaultVoice: null,
    voices: [],
    controls: { temperature: true },
  },
  [LLM_MODEL_IDS.gpt5]: {
    id: LLM_MODEL_IDS.gpt5,
    label: 'GPT-5',
    shortLabel: 'GPT-5',
    kind: 'llm',
    backend: 'openai-plugin',
    runtimeModel: 'gpt-5',
    defaultVoice: null,
    voices: [],
    controls: { temperature: true },
  },
  [LLM_MODEL_IDS.grok46]: {
    id: LLM_MODEL_IDS.grok46,
    label: 'Grok 4.6',
    shortLabel: 'Grok 4.6',
    kind: 'llm',
    backend: 'xai-plugin',
    runtimeModel: 'grok-4.6',
    defaultVoice: null,
    voices: [],
    controls: { temperature: true },
  },
  [LLM_MODEL_IDS.grok43]: {
    id: LLM_MODEL_IDS.grok43,
    label: 'Grok 4.3',
    shortLabel: 'Grok 4.3',
    kind: 'llm',
    backend: 'xai-plugin',
    runtimeModel: 'grok-4.3',
    defaultVoice: null,
    voices: [],
    controls: { temperature: true },
  },
  [LLM_MODEL_IDS.gptRealtime21]: {
    id: LLM_MODEL_IDS.gptRealtime21,
    label: 'GPT Realtime 2.1',
    shortLabel: 'Realtime',
    kind: 'realtime',
    backend: 'openai-plugin',
    runtimeModel: 'gpt-realtime-2.1',
    defaultVoice: 'marin',
    voices: OPENAI_REALTIME_VOICES,
    controls: { temperature: true },
  },
  [LLM_MODEL_IDS.gptRealtime21Mini]: {
    id: LLM_MODEL_IDS.gptRealtime21Mini,
    label: 'GPT Realtime 2.1 mini',
    shortLabel: 'RT mini',
    kind: 'realtime',
    backend: 'openai-plugin',
    runtimeModel: 'gpt-realtime-2.1-mini',
    defaultVoice: 'marin',
    voices: OPENAI_REALTIME_VOICES,
    controls: { temperature: true },
  },
  [LLM_MODEL_IDS.grokVoice20]: {
    id: LLM_MODEL_IDS.grokVoice20,
    label: 'Grok Voice 2.0',
    shortLabel: 'Grok Voice',
    kind: 'realtime',
    backend: 'xai-plugin',
    runtimeModel: 'grok-voice-think-fast-2.0',
    defaultVoice: 'ara',
    voices: GROK_VOICES,
    controls: { temperature: false },
  },
};

export const LLM_MODEL_LIST: readonly LlmModelSpec[] = KNOWN_LLM_MODEL_IDS.map(
  (id) => LLM_MODELS[id],
);

export const PIPELINE_LLM_MODEL_LIST: readonly LlmModelSpec[] =
  LLM_MODEL_LIST.filter((spec) => spec.kind === 'llm');

export const REALTIME_LLM_MODEL_LIST: readonly LlmModelSpec[] =
  LLM_MODEL_LIST.filter((spec) => spec.kind === 'realtime');

export function isKnownLlmModel(id: string): id is LlmModelId {
  return (KNOWN_LLM_MODEL_IDS as readonly string[]).includes(id);
}

export function canonicalizeLlmModelId(
  raw: string | null | undefined,
): LlmModelId | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return (
    LLM_MODEL_ALIASES[trimmed] ?? LLM_MODEL_ALIASES[trimmed.toLowerCase()]
  );
}

export function llmModelSpec(
  id: string | null | undefined,
): LlmModelSpec {
  const canonical = canonicalizeLlmModelId(id) ?? DEFAULT_LLM_MODEL_ID;
  return LLM_MODELS[canonical];
}

export function isRealtimeLlmModel(id: string | null | undefined): boolean {
  const canonical = canonicalizeLlmModelId(id);
  return canonical ? LLM_MODELS[canonical].kind === 'realtime' : false;
}

export function voicesForLlmModel(
  id: string | null | undefined,
): readonly TtsVoiceOption[] {
  return llmModelSpec(id).voices;
}

export function featuredVoicesForLlmModel(
  id: string | null | undefined,
): readonly TtsVoiceOption[] {
  const voices = voicesForLlmModel(id);
  const featured = voices.filter((v) => v.featured === true);
  return featured.length > 0 ? featured : voices;
}

export function isLlmVoiceAllowed(
  llmModelId: string | null | undefined,
  voice: string | null | undefined,
): boolean {
  if (voice == null) return true;
  const trimmed = voice.trim();
  if (!trimmed) return true;
  const spec = llmModelSpec(llmModelId);
  if (spec.kind !== 'realtime') return true;
  return spec.voices.some((v) => v.id === trimmed);
}

/** Realtime voices come from the LLM catalog; pipeline voices from TTS. */
export function isAgentVoiceAllowed(input: {
  model?: string | null;
  ttsModel?: string | null;
  voice?: string | null;
}): boolean {
  if (isRealtimeLlmModel(input.model)) {
    return isLlmVoiceAllowed(input.model, input.voice);
  }
  return isVoiceAllowed(input.ttsModel, input.voice);
}
