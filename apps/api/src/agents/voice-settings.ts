export const DELIVERY_MODES = ['STABLE', 'BALANCED', 'CREATIVE'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export type VoiceRuntime = {
  voice: string | null;
  model: string | null;
  temperature: number | null;
  speakingRate: number | null;
  deliveryMode: string | null;
};

export function isDeliveryMode(value: unknown): value is DeliveryMode {
  return (
    typeof value === 'string' &&
    (DELIVERY_MODES as readonly string[]).includes(value)
  );
}

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
  org?: Partial<VoiceRuntime> | null,
  template?: Partial<VoiceRuntime> | null,
): VoiceRuntime {
  return {
    voice: org?.voice ?? template?.voice ?? null,
    model: org?.model ?? template?.model ?? null,
    temperature: org?.temperature ?? template?.temperature ?? null,
    speakingRate: org?.speakingRate ?? template?.speakingRate ?? null,
    deliveryMode: org?.deliveryMode ?? template?.deliveryMode ?? null,
  };
}
