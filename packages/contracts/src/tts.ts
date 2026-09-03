/**
 * Speech-model catalog for agent config.
 * `model` on agents remains the LLM override; TTS is `ttsModel` + `voice`.
 */

export const TTS_BACKENDS = [
  'livekit-inference',
  'openai-plugin',
  'xai-plugin',
] as const;
export type TtsBackend = (typeof TTS_BACKENDS)[number];

export const TTS_MODEL_IDS = {
  inworldTts2: 'inworld/inworld-tts-2',
  fishS21ProFree: 'fishaudio/s2.1-pro-free',
  openaiGpt4oMiniTts: 'openai/gpt-4o-mini-tts',
  xaiTts1: 'xai/tts-1',
} as const;

export type TtsModelId = (typeof TTS_MODEL_IDS)[keyof typeof TTS_MODEL_IDS];

export const KNOWN_TTS_MODEL_IDS = [
  TTS_MODEL_IDS.inworldTts2,
  TTS_MODEL_IDS.fishS21ProFree,
  TTS_MODEL_IDS.openaiGpt4oMiniTts,
  TTS_MODEL_IDS.xaiTts1,
] as const satisfies readonly TtsModelId[];

export const DEFAULT_TTS_MODEL_ID = TTS_MODEL_IDS.inworldTts2;

/** Incoming slugs (short ids, Fish OpenRouter-shaped ids) → stored canonical id. */
export const TTS_MODEL_ALIASES: Record<string, TtsModelId> = {
  'inworld/inworld-tts-2': TTS_MODEL_IDS.inworldTts2,
  'inworld-tts-2': TTS_MODEL_IDS.inworldTts2,
  'fishaudio/s2.1-pro-free': TTS_MODEL_IDS.fishS21ProFree,
  'fish-audio/s2.1-pro-free': TTS_MODEL_IDS.fishS21ProFree,
  'fish-audio/s2.1-pro-free:free': TTS_MODEL_IDS.fishS21ProFree,
  'openai/gpt-4o-mini-tts': TTS_MODEL_IDS.openaiGpt4oMiniTts,
  'gpt-4o-mini-tts': TTS_MODEL_IDS.openaiGpt4oMiniTts,
  'xai/tts-1': TTS_MODEL_IDS.xaiTts1,
  'xai/tts': TTS_MODEL_IDS.xaiTts1,
  'grok-tts': TTS_MODEL_IDS.xaiTts1,
};

export type TtsVoiceOption = {
  id: string;
  name: string;
  line: string;
  initial: string;
  /** Portal tiles; remaining voices go in a select. Default true. */
  featured?: boolean;
};

export type TtsModelSpec = {
  id: TtsModelId;
  label: string;
  shortLabel: string;
  backend: TtsBackend;
  /** Id sent to LiveKit Inference or the OpenAI TTS plugin. */
  runtimeModel: string;
  defaultVoice: string;
  voices: readonly TtsVoiceOption[];
  controls: {
    speakingRate: boolean;
    deliveryMode: boolean;
  };
};

const INWORLD_VOICES: readonly TtsVoiceOption[] = [
  { id: 'Ashley', name: 'Ashley', line: 'Warm American', initial: 'A' },
  { id: 'Edward', name: 'Edward', line: 'Emphatic American', initial: 'E' },
  { id: 'Olivia', name: 'Olivia', line: 'Upbeat British', initial: 'O' },
  { id: 'Diego', name: 'Diego', line: 'Gentle Mexican', initial: 'D' },
  { id: 'Luna', name: 'Luna', line: 'Chill American', initial: 'L' },
  { id: 'Ara', name: 'Ara', line: 'Warm, friendly', initial: 'R' },
  { id: 'Sarah', name: 'Sarah', line: 'Clear American', initial: 'S' },
  { id: 'Clive', name: 'Clive', line: 'Measured British', initial: 'C' },
];

const FISH_VOICES: readonly TtsVoiceOption[] = [
  {
    id: 'bf322df2096a46f18c579d0baa36f41d',
    name: 'Adrian',
    line: 'Friendly American',
    initial: 'A',
  },
  {
    id: '536d3a5e000945adb7038665781a4aca',
    name: 'Ethan',
    line: 'Curious explainer',
    initial: 'E',
  },
  {
    id: '9a9cf47702da476aa4629e2506d4a857',
    name: 'Hannah',
    line: 'Conversational',
    initial: 'H',
  },
  {
    id: '79d0bd3e4e5444b18f7b6d89b5927bf1',
    name: 'Jordan',
    line: 'Motivational',
    initial: 'J',
  },
  {
    id: 'e3cd384158934cc9a01029cd7d278634',
    name: 'Laura',
    line: 'Confident narrator',
    initial: 'L',
  },
  {
    id: '933563129e564b19a115bedd57b7406a',
    name: 'Sarah',
    line: 'Engaged speaker',
    initial: 'S',
  },
  {
    id: 'b347db033a6549378b48d00acb0d06cd',
    name: 'Selene',
    line: 'Meditative',
    initial: 'N',
  },
];

const OPENAI_TTS_VOICES: readonly TtsVoiceOption[] = [
  { id: 'ash', name: 'Ash', line: 'Clear', initial: 'A', featured: true },
  { id: 'alloy', name: 'Alloy', line: 'Neutral', initial: 'Y', featured: true },
  { id: 'coral', name: 'Coral', line: 'Bright', initial: 'C', featured: true },
  { id: 'sage', name: 'Sage', line: 'Calm', initial: 'S', featured: true },
  { id: 'ballad', name: 'Ballad', line: 'Warm', initial: 'B' },
  { id: 'echo', name: 'Echo', line: 'Even', initial: 'E' },
  { id: 'fable', name: 'Fable', line: 'Storyteller', initial: 'F' },
  { id: 'nova', name: 'Nova', line: 'Bright', initial: 'N' },
  { id: 'onyx', name: 'Onyx', line: 'Deep', initial: 'O' },
  { id: 'shimmer', name: 'Shimmer', line: 'Light', initial: 'H' },
];

export const GROK_VOICES: readonly TtsVoiceOption[] = [
  { id: 'ara', name: 'Ara', line: 'Warm, friendly', initial: 'A', featured: true },
  { id: 'eve', name: 'Eve', line: 'Energetic', initial: 'E', featured: true },
  { id: 'leo', name: 'Leo', line: 'Authoritative', initial: 'L', featured: true },
  { id: 'rex', name: 'Rex', line: 'Confident', initial: 'R', featured: true },
  { id: 'sal', name: 'Sal', line: 'Smooth', initial: 'S', featured: true },
  { id: 'carina', name: 'Carina', line: 'Soft, empathetic', initial: 'C' },
  { id: 'zagan', name: 'Zagan', line: 'Powerful', initial: 'Z' },
  { id: 'helix', name: 'Helix', line: 'Bold', initial: 'H' },
  { id: 'orion', name: 'Orion', line: 'Cinematic', initial: 'O' },
  { id: 'luna', name: 'Luna', line: 'Gentle', initial: 'U' },
  { id: 'iris', name: 'Iris', line: 'Friendly', initial: 'I' },
  { id: 'altair', name: 'Altair', line: 'Elegant', initial: 'T' },
  { id: 'zenith', name: 'Zenith', line: 'Sharp', initial: 'N' },
  { id: 'perseus', name: 'Perseus', line: 'Strong', initial: 'P' },
  { id: 'helios', name: 'Helios', line: 'Upbeat', initial: 'D' },
  { id: 'lux', name: 'Lux', line: 'Calm', initial: 'X' },
  { id: 'kepler', name: 'Kepler', line: 'Inventive', initial: 'K' },
  { id: 'rigel', name: 'Rigel', line: 'Precise', initial: 'G' },
  { id: 'cosmo', name: 'Cosmo', line: 'Curious', initial: 'M' },
  { id: 'celeste', name: 'Celeste', line: 'Compassionate', initial: 'Q' },
  { id: 'ursa', name: 'Ursa', line: 'Warm', initial: 'B' },
  { id: 'sirius', name: 'Sirius', line: 'Quick-witted', initial: 'Y' },
  { id: 'lumen', name: 'Lumen', line: 'Articulate', initial: 'W' },
  { id: 'castor', name: 'Castor', line: 'Charismatic', initial: 'F' },
  { id: 'naksh', name: 'Naksh', line: 'Thoughtful', initial: 'J' },
  { id: 'atlas', name: 'Atlas', line: 'Commanding', initial: 'V' },
];

export const TTS_MODELS: Record<TtsModelId, TtsModelSpec> = {
  [TTS_MODEL_IDS.inworldTts2]: {
    id: TTS_MODEL_IDS.inworldTts2,
    label: 'Inworld TTS-2',
    shortLabel: 'Inworld',
    backend: 'livekit-inference',
    runtimeModel: TTS_MODEL_IDS.inworldTts2,
    defaultVoice: 'Ashley',
    voices: INWORLD_VOICES,
    controls: { speakingRate: true, deliveryMode: true },
  },
  [TTS_MODEL_IDS.fishS21ProFree]: {
    id: TTS_MODEL_IDS.fishS21ProFree,
    label: 'Fish Audio S2.1 Pro',
    shortLabel: 'Fish',
    backend: 'livekit-inference',
    runtimeModel: TTS_MODEL_IDS.fishS21ProFree,
    defaultVoice: '933563129e564b19a115bedd57b7406a',
    voices: FISH_VOICES,
    controls: { speakingRate: true, deliveryMode: false },
  },
  [TTS_MODEL_IDS.openaiGpt4oMiniTts]: {
    id: TTS_MODEL_IDS.openaiGpt4oMiniTts,
    label: 'OpenAI GPT-4o mini TTS',
    shortLabel: 'OpenAI',
    backend: 'openai-plugin',
    runtimeModel: 'gpt-4o-mini-tts',
    defaultVoice: 'ash',
    voices: OPENAI_TTS_VOICES,
    controls: { speakingRate: true, deliveryMode: false },
  },
  [TTS_MODEL_IDS.xaiTts1]: {
    id: TTS_MODEL_IDS.xaiTts1,
    label: 'Grok TTS',
    shortLabel: 'Grok',
    backend: 'xai-plugin',
    runtimeModel: TTS_MODEL_IDS.xaiTts1,
    defaultVoice: 'ara',
    voices: GROK_VOICES,
    controls: { speakingRate: true, deliveryMode: false },
  },
};

export const TTS_MODEL_LIST: readonly TtsModelSpec[] = KNOWN_TTS_MODEL_IDS.map(
  (id) => TTS_MODELS[id],
);

export function isKnownTtsModel(id: string): id is TtsModelId {
  return (KNOWN_TTS_MODEL_IDS as readonly string[]).includes(id);
}

/** Map an alias or canonical id to a catalog id. Unknown / empty → undefined. */
export function canonicalizeTtsModelId(
  raw: string | null | undefined,
): TtsModelId | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return (
    TTS_MODEL_ALIASES[trimmed] ?? TTS_MODEL_ALIASES[trimmed.toLowerCase()]
  );
}

export function ttsModelSpec(
  id: string | null | undefined,
): TtsModelSpec {
  const canonical = canonicalizeTtsModelId(id) ?? DEFAULT_TTS_MODEL_ID;
  return TTS_MODELS[canonical];
}

export function defaultVoiceForTtsModel(
  id: string | null | undefined,
): string {
  return ttsModelSpec(id).defaultVoice;
}

export function voicesForTtsModel(
  id: string | null | undefined,
): readonly TtsVoiceOption[] {
  return ttsModelSpec(id).voices;
}

export function featuredVoicesForTtsModel(
  id: string | null | undefined,
): readonly TtsVoiceOption[] {
  const voices = voicesForTtsModel(id);
  const featured = voices.filter((v) => v.featured === true);
  return featured.length > 0 ? featured : voices;
}

export function isVoiceAllowed(
  ttsModelId: string | null | undefined,
  voice: string | null | undefined,
): boolean {
  if (voice == null) return true;
  const trimmed = voice.trim();
  if (!trimmed) return true;
  return voicesForTtsModel(ttsModelId).some((v) => v.id === trimmed);
}
