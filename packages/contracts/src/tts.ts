/**
 * Speech-model catalog for agent config.
 * `model` on agents remains the LLM override; TTS is `ttsModel` + `voice`.
 */

export const TTS_BACKENDS = ['livekit-inference', 'openrouter'] as const;
export type TtsBackend = (typeof TTS_BACKENDS)[number];

export const TTS_MODEL_IDS = {
  inworldTts2: 'inworld/inworld-tts-2',
  fishS21ProFree: 'fishaudio/s2.1-pro-free',
  gemini31FlashTts: 'google/gemini-3.1-flash-tts-preview',
} as const;

export type TtsModelId = (typeof TTS_MODEL_IDS)[keyof typeof TTS_MODEL_IDS];

export const KNOWN_TTS_MODEL_IDS = [
  TTS_MODEL_IDS.inworldTts2,
  TTS_MODEL_IDS.fishS21ProFree,
  TTS_MODEL_IDS.gemini31FlashTts,
] as const satisfies readonly TtsModelId[];

export const DEFAULT_TTS_MODEL_ID = TTS_MODEL_IDS.inworldTts2;

/** Incoming slugs (OpenRouter, short ids) → stored canonical id. */
export const TTS_MODEL_ALIASES: Record<string, TtsModelId> = {
  'inworld/inworld-tts-2': TTS_MODEL_IDS.inworldTts2,
  'inworld-tts-2': TTS_MODEL_IDS.inworldTts2,
  'fishaudio/s2.1-pro-free': TTS_MODEL_IDS.fishS21ProFree,
  'fish-audio/s2.1-pro-free': TTS_MODEL_IDS.fishS21ProFree,
  'fish-audio/s2.1-pro-free:free': TTS_MODEL_IDS.fishS21ProFree,
  'google/gemini-3.1-flash-tts-preview': TTS_MODEL_IDS.gemini31FlashTts,
  'gemini-3.1-flash-tts-preview': TTS_MODEL_IDS.gemini31FlashTts,
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
  /** Id sent to LiveKit Inference or OpenRouter. */
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

const GEMINI_VOICES: readonly TtsVoiceOption[] = [
  { id: 'Zephyr', name: 'Zephyr', line: 'Bright', initial: 'Z', featured: true },
  { id: 'Puck', name: 'Puck', line: 'Upbeat', initial: 'P', featured: true },
  {
    id: 'Charon',
    name: 'Charon',
    line: 'Informative',
    initial: 'C',
    featured: true,
  },
  { id: 'Kore', name: 'Kore', line: 'Firm', initial: 'K', featured: true },
  {
    id: 'Fenrir',
    name: 'Fenrir',
    line: 'Excitable',
    initial: 'F',
    featured: true,
  },
  { id: 'Leda', name: 'Leda', line: 'Youthful', initial: 'L' },
  { id: 'Orus', name: 'Orus', line: 'Firm', initial: 'O' },
  { id: 'Aoede', name: 'Aoede', line: 'Breezy', initial: 'A', featured: true },
  { id: 'Callirrhoe', name: 'Callirrhoe', line: 'Easy-going', initial: 'C' },
  { id: 'Autonoe', name: 'Autonoe', line: 'Bright', initial: 'U' },
  {
    id: 'Enceladus',
    name: 'Enceladus',
    line: 'Breathy',
    initial: 'E',
    featured: true,
  },
  { id: 'Iapetus', name: 'Iapetus', line: 'Clear', initial: 'I' },
  { id: 'Umbriel', name: 'Umbriel', line: 'Easy-going', initial: 'U' },
  { id: 'Algieba', name: 'Algieba', line: 'Smooth', initial: 'A' },
  { id: 'Despina', name: 'Despina', line: 'Smooth', initial: 'D' },
  { id: 'Erinome', name: 'Erinome', line: 'Clear', initial: 'E' },
  { id: 'Algenib', name: 'Algenib', line: 'Gravelly', initial: 'A' },
  { id: 'Rasalgethi', name: 'Rasalgethi', line: 'Informative', initial: 'R' },
  { id: 'Laomedeia', name: 'Laomedeia', line: 'Upbeat', initial: 'L' },
  { id: 'Achernar', name: 'Achernar', line: 'Soft', initial: 'A' },
  { id: 'Alnilam', name: 'Alnilam', line: 'Firm', initial: 'A' },
  { id: 'Schedar', name: 'Schedar', line: 'Even', initial: 'S' },
  { id: 'Gacrux', name: 'Gacrux', line: 'Mature', initial: 'G' },
  { id: 'Pulcherrima', name: 'Pulcherrima', line: 'Forward', initial: 'P' },
  { id: 'Achird', name: 'Achird', line: 'Friendly', initial: 'A' },
  { id: 'Zubenelgenubi', name: 'Zubenelgenubi', line: 'Casual', initial: 'Z' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', line: 'Gentle', initial: 'V' },
  { id: 'Sadachbia', name: 'Sadachbia', line: 'Lively', initial: 'S' },
  { id: 'Sadaltager', name: 'Sadaltager', line: 'Knowledgeable', initial: 'S' },
  {
    id: 'Sulafat',
    name: 'Sulafat',
    line: 'Warm',
    initial: 'S',
    featured: true,
  },
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
  [TTS_MODEL_IDS.gemini31FlashTts]: {
    id: TTS_MODEL_IDS.gemini31FlashTts,
    label: 'Gemini 3.1 Flash TTS',
    shortLabel: 'Gemini',
    backend: 'openrouter',
    runtimeModel: TTS_MODEL_IDS.gemini31FlashTts,
    defaultVoice: 'Kore',
    voices: GEMINI_VOICES,
    controls: { speakingRate: false, deliveryMode: false },
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
