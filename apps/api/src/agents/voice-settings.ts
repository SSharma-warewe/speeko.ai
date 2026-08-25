import {
  DELIVERY_MODES,
  isDeliveryMode,
  type DeliveryMode,
} from '@call-agent/contracts';

export { DELIVERY_MODES, isDeliveryMode };
export type { DeliveryMode };

export type VoiceRuntime = {
  voice: string | null;
  model: string | null;
  temperature: number | null;
  speakingRate: number | null;
  deliveryMode: DeliveryMode | null;
};

type VoiceRuntimeInput = Partial<{
  voice: string | null;
  model: string | null;
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

export function resolveVoiceRuntime(
  org?: VoiceRuntimeInput | null,
  template?: VoiceRuntimeInput | null,
): VoiceRuntime {
  return {
    voice: org?.voice ?? template?.voice ?? null,
    model: org?.model ?? template?.model ?? null,
    temperature: org?.temperature ?? template?.temperature ?? null,
    speakingRate: org?.speakingRate ?? template?.speakingRate ?? null,
    deliveryMode: normalizeDeliveryMode(
      org?.deliveryMode ?? template?.deliveryMode ?? null,
    ),
  };
}
