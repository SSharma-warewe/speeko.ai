/** Inworld TTS-2 delivery_mode. LLM temperature is a separate field. */
export const DELIVERY_MODES = ['STABLE', 'BALANCED', 'CREATIVE'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export function isDeliveryMode(value: unknown): value is DeliveryMode {
  return (
    typeof value === 'string' &&
    (DELIVERY_MODES as readonly string[]).includes(value)
  );
}
