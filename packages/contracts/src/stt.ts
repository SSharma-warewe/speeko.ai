/**
 * Speech-to-text catalog for pipeline agents.
 * `null` on agents = Deepgram Nova-3 via LiveKit Inference.
 * Ignored when `model` is a realtime (speech-to-speech) id.
 */

export const STT_BACKENDS = ['livekit-inference', 'sarvam-plugin'] as const;
export type SttBackend = (typeof STT_BACKENDS)[number];

export const STT_MODEL_IDS = {
  deepgramNova3: 'deepgram/nova-3',
  sarvamSaarasV3: 'sarvam/saaras-v3',
} as const;

export type SttModelId = (typeof STT_MODEL_IDS)[keyof typeof STT_MODEL_IDS];

export const KNOWN_STT_MODEL_IDS = [
  STT_MODEL_IDS.deepgramNova3,
  STT_MODEL_IDS.sarvamSaarasV3,
] as const satisfies readonly SttModelId[];

export const DEFAULT_STT_MODEL_ID = STT_MODEL_IDS.deepgramNova3;

export const STT_MODEL_ALIASES: Record<string, SttModelId> = {
  'deepgram/nova-3': STT_MODEL_IDS.deepgramNova3,
  'deepgram/nova-3-multilingual': STT_MODEL_IDS.deepgramNova3,
  'nova-3': STT_MODEL_IDS.deepgramNova3,
  'sarvam/saaras-v3': STT_MODEL_IDS.sarvamSaarasV3,
  'saaras:v3': STT_MODEL_IDS.sarvamSaarasV3,
  'sarvam/saaras': STT_MODEL_IDS.sarvamSaarasV3,
  'sarvam-stt': STT_MODEL_IDS.sarvamSaarasV3,
};

export type SttModelSpec = {
  id: SttModelId;
  label: string;
  shortLabel: string;
  backend: SttBackend;
  runtimeModel: string;
};

export const STT_MODELS: Record<SttModelId, SttModelSpec> = {
  [STT_MODEL_IDS.deepgramNova3]: {
    id: STT_MODEL_IDS.deepgramNova3,
    label: 'Deepgram Nova-3',
    shortLabel: 'Deepgram',
    backend: 'livekit-inference',
    runtimeModel: STT_MODEL_IDS.deepgramNova3,
  },
  [STT_MODEL_IDS.sarvamSaarasV3]: {
    id: STT_MODEL_IDS.sarvamSaarasV3,
    label: 'Sarvam Saaras v3',
    shortLabel: 'Sarvam',
    backend: 'sarvam-plugin',
    runtimeModel: 'saaras:v3',
  },
};

export const STT_MODEL_LIST: readonly SttModelSpec[] = KNOWN_STT_MODEL_IDS.map(
  (id) => STT_MODELS[id],
);

export function isKnownSttModel(id: string): id is SttModelId {
  return (KNOWN_STT_MODEL_IDS as readonly string[]).includes(id);
}

export function canonicalizeSttModelId(
  raw: string | null | undefined,
): SttModelId | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return (
    STT_MODEL_ALIASES[trimmed] ?? STT_MODEL_ALIASES[trimmed.toLowerCase()]
  );
}

export function sttModelSpec(
  id: string | null | undefined,
): SttModelSpec {
  const canonical = canonicalizeSttModelId(id) ?? DEFAULT_STT_MODEL_ID;
  return STT_MODELS[canonical];
}

export function isSarvamSttModel(id: string | null | undefined): boolean {
  return sttModelSpec(id).backend === 'sarvam-plugin';
}
