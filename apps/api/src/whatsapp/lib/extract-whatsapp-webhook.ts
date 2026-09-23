export type ExtractedWhatsAppWebhook = {
  eventType: string;
  phoneNumberId: string | null;
  wabaId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Graph ids arrive as strings; some payloads send them as numbers. */
function asId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
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
  const entries = Array.isArray(payload.entry)
    ? payload.entry
    : isRecord(payload.entry)
      ? [payload.entry]
      : [];
  let eventType: string | null = null;
  let phoneNumberId: string | null = null;
  let wabaId: string | null = null;

  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue;
    }
    if (!wabaId) {
      wabaId = asId(entry.id);
    }
    const changes = Array.isArray(entry.changes)
      ? entry.changes
      : isRecord(entry.changes)
        ? [entry.changes]
        : [];
    for (const change of changes) {
      if (!isRecord(change)) {
        continue;
      }
      if (!eventType) {
        eventType = asId(change.field);
      }
      if (!phoneNumberId && isRecord(change.value)) {
        const metadata = isRecord(change.value.metadata)
          ? change.value.metadata
          : null;
        phoneNumberId = metadata ? asId(metadata.phone_number_id) : null;
      }
    }
  }

  return {
    eventType: eventType ?? 'unknown',
    phoneNumberId,
    wabaId,
  };
}

/** First inbound message, shortened for the org event list. */
export function previewWhatsAppWebhook(payload: unknown): string | null {
  const message = firstInboundMessage(payload);
  if (message) {
    const from = asId(message.from);
    const text = messageText(message);
    if (from && text) {
      return trimPreview(`${from}: ${text}`);
    }
    if (text) {
      return trimPreview(text);
    }
    if (from) {
      return trimPreview(from);
    }
  }
  if (typeof payload === 'string') {
    return trimPreview(payload);
  }
  return null;
}

function firstInboundMessage(
  payload: unknown,
): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    return null;
  }
  const entries = Array.isArray(payload.entry)
    ? payload.entry
    : isRecord(payload.entry)
      ? [payload.entry]
      : [];
  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue;
    }
    const changes = Array.isArray(entry.changes)
      ? entry.changes
      : isRecord(entry.changes)
        ? [entry.changes]
        : [];
    for (const change of changes) {
      if (!isRecord(change) || !isRecord(change.value)) {
        continue;
      }
      const messages = change.value.messages;
      if (!Array.isArray(messages)) {
        continue;
      }
      const message = messages.find(isRecord);
      if (message) {
        return message;
      }
    }
  }
  return null;
}

function messageText(message: Record<string, unknown>): string | null {
  if (isRecord(message.text)) {
    const body = asId(message.text.body);
    if (body) {
      return body;
    }
  }
  return asId(message.type);
}

function trimPreview(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 180) {
    return trimmed;
  }
  return `${trimmed.slice(0, 177)}…`;
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
