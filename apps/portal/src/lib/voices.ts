import {
  DEFAULT_LLM_MODEL_ID,
  DEFAULT_TTS_MODEL_ID,
  DELIVERY_MODES,
  PIPELINE_LLM_MODEL_LIST,
  REALTIME_LLM_MODEL_LIST,
  TTS_MODEL_LIST,
  canonicalizeLlmModelId,
  canonicalizeTtsModelId,
  featuredVoicesForLlmModel,
  featuredVoicesForTtsModel,
  isRealtimeLlmModel,
  llmModelSpec,
  ttsModelSpec,
  voicesForLlmModel,
  voicesForTtsModel,
  type DeliveryMode,
  type LlmModelId,
  type TtsModelId,
  type TtsVoiceOption,
} from "@call-agent/contracts";

export {
  DELIVERY_MODES,
  isRealtimeLlmModel,
  llmModelSpec,
  ttsModelSpec,
  type DeliveryMode,
  type LlmModelId,
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
export const DEFAULT_LLM_MODEL: LlmModelId = DEFAULT_LLM_MODEL_ID;
export const DEFAULT_REALTIME_MODEL: LlmModelId =
  "openai/gpt-realtime-2.1-mini";

export const TTS_MODEL_OPTIONS = TTS_MODEL_LIST.map((spec) => ({
  value: spec.id,
  label: spec.shortLabel,
  hint: spec.label,
}));

export const PIPELINE_LLM_OPTIONS = PIPELINE_LLM_MODEL_LIST.map((spec) => ({
  value: spec.id,
  label: spec.label,
  hint: spec.shortLabel,
}));

export const REALTIME_LLM_OPTIONS = REALTIME_LLM_MODEL_LIST.map((spec) => ({
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

export function parseLlmModel(value: string | null | undefined): LlmModelId {
  return canonicalizeLlmModelId(value) ?? DEFAULT_LLM_MODEL;
}

/** Persist default / unknown catalog ids as null (worker Inworld pin). */
export function storedTtsModel(
  value: string | null | undefined,
): string | null {
  const id = canonicalizeTtsModelId(value);
  if (!id || id === DEFAULT_TTS_MODEL) return null;
  return id;
}

/** Persist default Gemma / unknown as null. */
export function storedLlmModel(
  value: string | null | undefined,
): string | null {
  const id = canonicalizeLlmModelId(value);
  if (!id || id === DEFAULT_LLM_MODEL) return null;
  return id;
}

/** Cast / spec label. Realtime has no TTS stage. */
export function speechModelLabel(
  model: string | null | undefined,
  ttsModel: string | null | undefined,
): string {
  if (isRealtimeLlmModel(model)) return "Realtime · no TTS";
  const id = canonicalizeTtsModelId(ttsModel);
  if (!id || id === DEFAULT_TTS_MODEL) return "Inworld TTS-2";
  return ttsModelSpec(id).label;
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

export function realtimeVoiceCatalog(
  llmModel: string | null | undefined,
  current: string | null,
): AgentVoiceOption[] {
  const spec = llmModelSpec(llmModel);
  const voices = voicesForLlmModel(spec.id);
  const options: AgentVoiceOption[] = voices.map((v) => ({
    ...v,
    storedId: v.id,
  }));
  if (current && !options.some((v) => v.id === current)) {
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

export function extraRealtimeVoiceCatalog(
  llmModel: string | null | undefined,
): TtsVoiceOption[] {
  const featured = new Set(featuredVoicesForLlmModel(llmModel).map((v) => v.id));
  const all = voicesForLlmModel(llmModel);
  if (featured.size === all.length) return [];
  return all.filter((v) => !featured.has(v.id));
}
