import type { SessionUserData, ToolEvent } from './types.js';

const MAX_STRING = 500;
const MAX_JSON_CHARS = 4000;
const MAX_DEPTH = 4;
const MAX_ARRAY = 40;
const MAX_KEYS = 40;

/**
 * Append a tool execution record for logs + call complete → portal.
 * Never put secrets (API keys, SIP passwords) in args/summary/result.
 */
export function recordToolEvent(
  userData: SessionUserData,
  event: Omit<ToolEvent, 'at'> & { at?: string },
): void {
  if (!userData.toolEvents) {
    userData.toolEvents = [];
  }
  const full: ToolEvent = {
    at: event.at ?? new Date().toISOString(),
    toolId: event.toolId,
    args: event.args !== undefined ? sanitizeForStorage(event.args) : undefined,
    result:
      event.result !== undefined ? sanitizeForStorage(event.result) : undefined,
    ok: event.ok,
    error: event.error ? String(event.error).slice(0, 500) : undefined,
    summary: event.summary ? String(event.summary).slice(0, 240) : undefined,
    durationMs: event.durationMs,
  };
  userData.toolEvents.push(full);

  const okLabel =
    full.ok === true ? 'ok' : full.ok === false ? 'fail' : 'n/a';
  const err = full.error ? ` error=${full.error}` : '';
  const ms = full.durationMs != null ? ` ${full.durationMs}ms` : '';
  const sum = full.summary ? ` ${full.summary.slice(0, 160)}` : '';
  console.log(
    `[tool:${full.toolId}] callId=${userData.callId ?? 'n/a'} → ${okLabel}${err}${ms}${sum}`,
  );
}

/**
 * Run a tool body and record args / result / duration on userData.
 */
export async function withToolRecording<T>(
  userData: SessionUserData,
  toolId: string,
  args: unknown,
  fn: () => Promise<T> | T,
  opts?: { skipRecord?: boolean },
): Promise<T> {
  if (opts?.skipRecord) {
    return await fn();
  }
  const started = Date.now();
  try {
    const result = await fn();
    const { ok, summary, error } = deriveOutcome(result);
    recordToolEvent(userData, {
      toolId,
      args,
      result,
      ok,
      error,
      summary,
      durationMs: Date.now() - started,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordToolEvent(userData, {
      toolId,
      args,
      ok: false,
      error: message,
      summary: message.slice(0, 240),
      durationMs: Date.now() - started,
    });
    throw err;
  }
}

function deriveOutcome(result: unknown): {
  ok: boolean;
  summary?: string;
  error?: string;
} {
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (typeof r.ok === 'boolean') {
      const summary =
        typeof r.message === 'string'
          ? r.message
          : typeof r.error === 'string'
            ? r.error
            : undefined;
      return {
        ok: r.ok,
        summary,
        error: r.ok === false && typeof r.error === 'string' ? r.error : undefined,
      };
    }
    if (typeof r.message === 'string') {
      return { ok: true, summary: r.message };
    }
    if (typeof r.outcome === 'string') {
      return { ok: true, summary: String(r.outcome) };
    }
  }
  if (typeof result === 'string') {
    return { ok: true, summary: result.slice(0, 240) };
  }
  return { ok: true };
}

/** Cap nested JSON for DB / logs. */
export function sanitizeForStorage(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (depth >= MAX_DEPTH) {
    try {
      const s = JSON.stringify(value);
      return s && s.length > 80 ? `${s.slice(0, 80)}…` : s;
    } catch {
      return '[truncated]';
    }
  }
  if (Array.isArray(value)) {
    const slice = value.slice(0, MAX_ARRAY).map((v) => sanitizeForStorage(v, depth + 1));
    if (value.length > MAX_ARRAY) {
      slice.push(`…+${value.length - MAX_ARRAY} more`);
    }
    return slice;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    let n = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (n >= MAX_KEYS) {
        out['…'] = 'truncated';
        break;
      }
      const lower = k.toLowerCase();
      if (
        lower.includes('password') ||
        lower.includes('api_key') ||
        lower.includes('apikey') ||
        lower.includes('secret') ||
        lower.includes('authorization') ||
        lower.includes('token')
      ) {
        out[k] = '[redacted]';
        n += 1;
        continue;
      }
      out[k] = sanitizeForStorage(v, depth + 1);
      n += 1;
    }
    // Final size guard
    try {
      const raw = JSON.stringify(out);
      if (raw && raw.length > MAX_JSON_CHARS) {
        return { _truncated: true, preview: `${raw.slice(0, MAX_JSON_CHARS)}…` };
      }
    } catch {
      return { _error: 'unserializable' };
    }
    return out;
  }
  return String(value).slice(0, MAX_STRING);
}

export function summarizeToolEvents(
  events: ToolEvent[] | undefined,
): string {
  if (!events?.length) return 'none';
  return events
    .map((e) => `${e.toolId}:${e.ok === false ? 'fail' : e.ok === true ? 'ok' : '?'}`)
    .join(',');
}
