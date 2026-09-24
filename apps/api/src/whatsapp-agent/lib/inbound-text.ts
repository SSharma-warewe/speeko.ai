export type InboundWhatsAppText = {
  id: string;
  from: string;
  body: string;
  phoneNumberId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (isRecord(value)) {
    return [value];
  }
  return [];
}

/**
 * Inbound user texts on a saved Meta webhook body.
 * Status callbacks, empty bodies, and non-text messages are omitted.
 * A message without a Meta id is omitted so a retry cannot be deduped.
 */
export function listInboundTextMessages(
  payload: unknown,
): InboundWhatsAppText[] {
  if (!isRecord(payload)) {
    return [];
  }
  const found: InboundWhatsAppText[] = [];
  for (const entry of asList(payload.entry)) {
    if (!isRecord(entry)) {
      continue;
    }
    for (const change of asList(entry.changes)) {
      if (!isRecord(change) || !isRecord(change.value)) {
        continue;
      }
      const metadata = isRecord(change.value.metadata)
        ? change.value.metadata
        : null;
      const phoneNumberId = metadata
        ? asId(metadata.phone_number_id)
        : null;
      for (const message of asList(change.value.messages)) {
        const text = inboundText(message, phoneNumberId);
        if (text) {
          found.push(text);
        }
      }
    }
  }
  return found;
}

function inboundText(
  message: unknown,
  phoneNumberId: string | null,
): InboundWhatsAppText | null {
  if (!isRecord(message) || message.type !== 'text' || !isRecord(message.text)) {
    return null;
  }
  const id = asId(message.id);
  const from = asId(message.from);
  const body = asId(message.text.body);
  if (!id || !from || !body || !/^[0-9]{6,20}$/.test(from)) {
    return null;
  }
  return { id, from, body, phoneNumberId };
}

/** Phone number id embedded in a Cloud API `…/{id}/messages` URL. */
export function phoneNumberIdFromMessagesUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    const parts = url.pathname.split('/').filter((part) => part.length > 0);
    const messagesAt = parts.lastIndexOf('messages');
    if (messagesAt <= 0) {
      return null;
    }
    return asId(parts[messagesAt - 1]);
  } catch {
    return null;
  }
}
