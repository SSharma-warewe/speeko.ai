import {
  DEFAULT_TTS_MODEL_ID,
  DELIVERY_MODES,
  TTS_MODEL_LIST,
  canonicalizeTtsModelId,
  featuredVoicesForTtsModel,
  ttsModelSpec,
  voicesForTtsModel,
  type DeliveryMode,
  type TtsModelId,
  type TtsVoiceOption,
} from "@call-agent/contracts";

export {
  DELIVERY_MODES,
  ttsModelSpec,
  type DeliveryMode,
  type TtsModelId,
  type TtsVoiceOption,
};

export type AgentVoiceOption = TtsVoiceOption & {
  /** null = stored default (worker pin / model default). Inworld only. */
  storedId: string | null;
};

export const DEFAULT_SPEAKING_RATE = 1;
export const DEFAULT_DELIVERY_MODE: DeliveryMode = "BALANCED";
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_TTS_MODEL: TtsModelId = DEFAULT_TTS_MODEL_ID;

export const TTS_MODEL_OPTIONS = TTS_MODEL_LIST.map((spec) => ({
  value: spec.id,
  label: spec.shortLabel,
  hint: spec.label,
}));

export function parseDeliveryMode(value: string | null | undefined): DeliveryMode {
  if (value === "STABLE" || value === "BALANCED" || value === "CREATIVE") {
    return value;
  }
  return DEFAULT_DELIVERY_MODE;
}

export function parseTtsModel(value: string | null | undefined): TtsModelId {
  return canonicalizeTtsModelId(value) ?? DEFAULT_TTS_MODEL;
}

export function voiceCatalog(
  ttsModel: string | null | undefined,
  current: string | null,
): AgentVoiceOption[] {
  const spec = ttsModelSpec(ttsModel);
  const voices = voicesForTtsModel(spec.id);
  const options: AgentVoiceOption[] = [];
  if (spec.id === DEFAULT_TTS_MODEL) {
    options.push({
      id: spec.defaultVoice,
      storedId: null,
      name: "Default",
      line: `${spec.defaultVoice} · worker pin`,
      initial: "★",
    });
  }
  for (const v of voices) {
    options.push({ ...v, storedId: v.id });
  }
  if (current && !options.some((v) => v.storedId === current || v.id === current)) {
    options.push({
      id: current,
      storedId: current,
      name: current,
      line: "Custom",
      initial: current.slice(0, 1).toUpperCase() || "?",
    });
  }
  return options;
}

export function featuredVoiceCatalog(
  ttsModel: string | null | undefined,
): TtsVoiceOption[] {
  return [...featuredVoicesForTtsModel(ttsModel)];
}

export function extraVoiceCatalog(
  ttsModel: string | null | undefined,
): TtsVoiceOption[] {
  const featured = new Set(featuredVoicesForTtsModel(ttsModel).map((v) => v.id));
  const all = voicesForTtsModel(ttsModel);
  if (featured.size === all.length) return [];
  return all.filter((v) => !featured.has(v.id));
}
