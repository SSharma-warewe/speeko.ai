export type ExtractedWhatsAppWebhook = {
  eventType: string;
  phoneNumberId: string | null;
  wabaId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Pull routing ids + field name from a Meta WhatsApp webhook body.
 * Unknown / partial payloads still return `eventType: 'unknown'`.
 */
export function extractWhatsAppWebhook(
  payload: Record<string, unknown>,
): ExtractedWhatsAppWebhook {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  let eventType: string | null = null;
  let phoneNumberId: string | null = null;
  let wabaId: string | null = null;

  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue;
    }
    if (!wabaId) {
      wabaId = asNonEmptyString(entry.id);
    }
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      if (!isRecord(change)) {
        continue;
      }
      if (!eventType) {
        eventType = asNonEmptyString(change.field);
      }
      if (!phoneNumberId && isRecord(change.value)) {
        const metadata = isRecord(change.value.metadata)
          ? change.value.metadata
          : null;
        phoneNumberId = metadata
          ? asNonEmptyString(metadata.phone_number_id)
          : null;
      }
    }
  }

  return {
    eventType: eventType ?? 'unknown',
    phoneNumberId,
    wabaId,
  };
}

export function isWebhookPayloadObject(
  payload: unknown,
): payload is Record<string, unknown> {
  if (!isRecord(payload)) {
    return false;
  }
  if (payload.entry !== undefined && !Array.isArray(payload.entry)) {
    return false;
  }
  return true;
}
