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

export type WhatsAppHubQuery = {
  mode?: string;
  token?: string;
  challenge?: string;
};

/**
 * Meta sends `hub.mode`, `hub.verify_token`, `hub.challenge`.
 * Express 5's default `simple` parser keeps dotted keys; an extended parser
 * nests them under `query.hub`. Accept both so verification is parser-agnostic.
 */
export function parseWhatsAppHubQuery(query: unknown): WhatsAppHubQuery {
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

/** Parse hub.* from the raw query string (bypasses Nest ValidationPipe / Express parser). */
export function parseWhatsAppHubSearch(search: string): WhatsAppHubQuery {
  const trimmed = search.startsWith('?') ? search.slice(1) : search;
  if (!trimmed) {
    return {};
  }
  const params = new URLSearchParams(trimmed);
  return {
    mode: params.get('hub.mode') ?? undefined,
    token: params.get('hub.verify_token') ?? undefined,
    challenge: params.get('hub.challenge') ?? undefined,
  };
}

/**
 * Prefer the raw request URL (what Meta actually sent), then fall back to
 * parsed `req.query` if a proxy already decoded it.
 */
export function parseWhatsAppHubRequest(req: {
  query?: unknown;
  originalUrl?: string;
  url?: string;
}): WhatsAppHubQuery {
  const raw = req.originalUrl || req.url || '';
  const qIndex = raw.indexOf('?');
  const fromUrl =
    qIndex >= 0 ? parseWhatsAppHubSearch(raw.slice(qIndex + 1)) : {};
  const fromQuery = parseWhatsAppHubQuery(req.query);
  return {
    mode: emptyToUndef(fromUrl.mode) ?? fromQuery.mode,
    token: emptyToUndef(fromUrl.token) ?? fromQuery.token,
    challenge: emptyToUndef(fromUrl.challenge) ?? fromQuery.challenge,
  };
}

function emptyToUndef(value?: string | null): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : undefined;
}
