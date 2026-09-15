/** First scalar from an Express query value (string, number, or first array entry). */
export function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value) && value.length > 0) {
    return firstQueryValue(value[0]);
  }
  return undefined;
}

/**
 * Meta sends `hub.mode`, `hub.verify_token`, `hub.challenge`.
 * Express 5's default `simple` parser keeps dotted keys; an extended parser
 * nests them under `query.hub`. Accept both so verification is parser-agnostic.
 */
export function parseWhatsAppHubQuery(query: unknown): {
  mode?: string;
  token?: string;
  challenge?: string;
} {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    return {};
  }
  const record = query as Record<string, unknown>;
  const hubRaw = record.hub;
  const hub =
    hubRaw && typeof hubRaw === 'object' && !Array.isArray(hubRaw)
      ? (hubRaw as Record<string, unknown>)
      : null;

  return {
    mode: firstQueryValue(hub?.mode) ?? firstQueryValue(record['hub.mode']),
    token:
      firstQueryValue(hub?.verify_token) ??
      firstQueryValue(record['hub.verify_token']),
    challenge:
      firstQueryValue(hub?.challenge) ??
      firstQueryValue(record['hub.challenge']),
  };
}
