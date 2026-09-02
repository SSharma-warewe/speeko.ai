import { BadRequestException } from '@nestjs/common';
import {
  DELIVERY_MODES,
  canonicalizeTtsModelId,
  isDeliveryMode,
  isVoiceAllowed,
  type DeliveryMode,
} from '@call-agent/contracts';

export { DELIVERY_MODES, isDeliveryMode };
export type { DeliveryMode };

export type VoiceRuntime = {
  voice: string | null;
  model: string | null;
  ttsModel: string | null;
  temperature: number | null;
  speakingRate: number | null;
  deliveryMode: DeliveryMode | null;
};

export type VoicePatchInput = Partial<{
  voice: string | null;
  model: string | null;
  ttsModel: string | null;
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

export function assertVoiceMatchesTtsModel(
  ttsModel: string | null | undefined,
  voice: string | null | undefined,
): void {
  if (isVoiceAllowed(ttsModel, voice)) return;
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
  if (dto.voice !== undefined) {
    row.voice = normalizeVoice(dto.voice);
  }
  if (dto.model !== undefined) {
    row.model = dto.model;
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
  if (dto.ttsModel !== undefined || dto.voice !== undefined) {
    assertVoiceMatchesTtsModel(
      row.ttsModel ?? fallbackTtsModel ?? null,
      row.voice,
    );
  }
}

export function resolveVoiceRuntime(
  org?: VoicePatchInput | null,
  template?: VoicePatchInput | null,
): VoiceRuntime {
  return {
    voice: org?.voice ?? template?.voice ?? null,
    model: org?.model ?? template?.model ?? null,
    ttsModel: org?.ttsModel ?? template?.ttsModel ?? null,
    temperature: org?.temperature ?? template?.temperature ?? null,
    speakingRate: org?.speakingRate ?? template?.speakingRate ?? null,
    deliveryMode: normalizeDeliveryMode(
      org?.deliveryMode ?? template?.deliveryMode ?? null,
    ),
  };
}
