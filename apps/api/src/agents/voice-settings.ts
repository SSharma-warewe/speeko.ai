import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_LLM_MODEL_ID,
  DEFAULT_STT_MODEL_ID,
  DELIVERY_MODES,
  canonicalizeLlmModelId,
  canonicalizeSpeechLanguageId,
  canonicalizeSttModelId,
  canonicalizeTtsModelId,
  isAgentVoiceAllowed,
  isDeliveryMode,
  isRealtimeLlmModel,
  type DeliveryMode,
} from '@call-agent/contracts';

export { DELIVERY_MODES, isDeliveryMode };
export type { DeliveryMode };

export type VoiceRuntime = {
  voice: string | null;
  model: string | null;
  ttsModel: string | null;
  sttModel: string | null;
  speechLanguage: string | null;
  temperature: number | null;
  speakingRate: number | null;
  deliveryMode: DeliveryMode | null;
};

export type VoicePatchInput = Partial<{
  voice: string | null;
  model: string | null;
  ttsModel: string | null;
  sttModel: string | null;
  speechLanguage: string | null;
  temperature: number | null;
  speakingRate: number | null;
  deliveryMode: string | null;
}>;

/** Empty / whitespace voice → null so the worker pin applies. */
export function normalizeVoice(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeDeliveryMode(
  value: string | null | undefined,
): DeliveryMode | null {
  if (value == null) return null;
  const trimmed = value.trim().toUpperCase();
  if (trimmed.length === 0) return null;
  return isDeliveryMode(trimmed) ? trimmed : null;
}

/**
 * Empty → null (worker default Inworld). Unknown slug → 400.
 */
export function parseStoredTtsModel(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const id = canonicalizeTtsModelId(trimmed);
  if (!id) {
    throw new BadRequestException(`Unknown TTS model: ${trimmed}`);
  }
  return id;
}

/**
 * Empty → null (worker default Gemma). Unknown slug → 400.
 * Default Gemma is stored as null.
 */
/**
 * Empty / Deepgram → null (worker default). Unknown slug → 400.
 */
export function parseStoredSttModel(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const id = canonicalizeSttModelId(trimmed);
  if (!id) {
    throw new BadRequestException(`Unknown STT model: ${trimmed}`);
  }
  return id === DEFAULT_STT_MODEL_ID ? null : id;
}

/**
 * Empty → null (worker default). Unknown code → 400.
 */
export function parseStoredSpeechLanguage(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const id = canonicalizeSpeechLanguageId(trimmed);
  if (!id) {
    throw new BadRequestException(`Unknown speech language: ${trimmed}`);
  }
  return id;
}

export function parseStoredLlmModel(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const id = canonicalizeLlmModelId(trimmed);
  if (!id) {
    throw new BadRequestException(`Unknown LLM model: ${trimmed}`);
  }
  return id === DEFAULT_LLM_MODEL_ID ? null : id;
}

export function assertVoiceMatchesRuntime(
  model: string | null | undefined,
  ttsModel: string | null | undefined,
  voice: string | null | undefined,
): void {
  if (isAgentVoiceAllowed({ model, ttsModel, voice })) return;
  if (isRealtimeLlmModel(model)) {
    throw new BadRequestException(
      `Voice is not available on realtime model ${model}`,
    );
  }
  const label = ttsModel?.trim() || 'inworld/inworld-tts-2';
  throw new BadRequestException(
    `Voice is not available on TTS model ${label}`,
  );
}

export function applyVoicePatch(
  row: VoicePatchInput,
  dto: VoicePatchInput,
  fallbackTtsModel?: string | null,
): void {
  if (dto.ttsModel !== undefined) {
    row.ttsModel = parseStoredTtsModel(dto.ttsModel);
  }
  if (dto.sttModel !== undefined) {
    row.sttModel = parseStoredSttModel(dto.sttModel);
  }
  if (dto.speechLanguage !== undefined) {
    row.speechLanguage = parseStoredSpeechLanguage(dto.speechLanguage);
  }
  if (dto.voice !== undefined) {
    row.voice = normalizeVoice(dto.voice);
  }
  if (dto.model !== undefined) {
    row.model = parseStoredLlmModel(dto.model);
  }
  if (dto.temperature !== undefined) {
    row.temperature = dto.temperature;
  }
  if (dto.speakingRate !== undefined) {
    row.speakingRate = dto.speakingRate;
  }
  if (dto.deliveryMode !== undefined) {
    row.deliveryMode = normalizeDeliveryMode(dto.deliveryMode);
  }
  // Speech-to-speech has no TTS/STT stage. Drop leftover pipeline speech
  // so GET / job metadata cannot keep advertising Inworld / Deepgram.
  if (isRealtimeLlmModel(row.model)) {
    row.ttsModel = null;
    row.sttModel = null;
    row.speechLanguage = null;
    row.speakingRate = null;
    row.deliveryMode = null;
  }
  if (
    dto.model !== undefined ||
    dto.ttsModel !== undefined ||
    dto.voice !== undefined
  ) {
    assertVoiceMatchesRuntime(
      row.model,
      row.ttsModel ?? fallbackTtsModel ?? null,
      row.voice,
    );
  }
}

export function resolveVoiceRuntime(
  org?: VoicePatchInput | null,
  template?: VoicePatchInput | null,
): VoiceRuntime {
  const model = org?.model ?? template?.model ?? null;
  if (isRealtimeLlmModel(model)) {
    return {
      voice: org?.voice ?? template?.voice ?? null,
      model,
      ttsModel: null,
      sttModel: null,
      speechLanguage: null,
      temperature: org?.temperature ?? template?.temperature ?? null,
      speakingRate: null,
      deliveryMode: null,
    };
  }
  return {
    voice: org?.voice ?? template?.voice ?? null,
    model,
    ttsModel: org?.ttsModel ?? template?.ttsModel ?? null,
    sttModel: org?.sttModel ?? template?.sttModel ?? null,
    speechLanguage: org?.speechLanguage ?? template?.speechLanguage ?? null,
    temperature: org?.temperature ?? template?.temperature ?? null,
    speakingRate: org?.speakingRate ?? template?.speakingRate ?? null,
    deliveryMode: normalizeDeliveryMode(
      org?.deliveryMode ?? template?.deliveryMode ?? null,
    ),
  };
}
