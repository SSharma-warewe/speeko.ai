/**
 * POST call completion (transcript / usage / task result / tool events) back to the Nest API.
 * No-ops when API_BASE_URL or WORKER_CALLBACK_SECRET is missing.
 *
 * Retries transient failures (5xx / 408 / 429 / network / abort) with a per-attempt
 * timeout so a hung fetch cannot pin the LiveKit job process. Never throws — hangup
 * and failedEarly callers still reach job shutdown after exhaustion.
 */

import type {
  CompleteCallPayload,
  InboundEnsurePayload,
} from '@call-agent/contracts';
import type { ToolEvent } from './tools/types.js';

export const DEFAULT_COMPLETE_CALLBACK_TIMEOUT_MS = 8_000;
export const DEFAULT_COMPLETE_CALLBACK_MAX_ATTEMPTS = 5;
export const DEFAULT_COMPLETE_CALLBACK_BACKOFF_MS = 500;
export const COMPLETE_CALLBACK_BACKOFF_CAP_MS = 4_000;

export type { CompleteCallPayload, InboundEnsurePayload, ToolEvent };

export type PostCallCompleteDeps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  env?: NodeJS.ProcessEnv;
  abortSignal?: (timeoutMs: number) => AbortSignal;
};

/** HTTP statuses that are worth retrying (timeout, rate-limit, server error). */
export function isRetryableCompleteStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function parseEnvInt(
  raw: string | undefined,
  fallback: number,
  min: number,
): number {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min) {
    return fallback;
  }
  return n;
}

function backoffMs(failedAttemptIndex: number, baseMs: number): number {
  const exp = baseMs * Math.pow(2, failedAttemptIndex);
  const capped = Math.min(COMPLETE_CALLBACK_BACKOFF_CAP_MS, exp);
  const jitter = capped * (0.8 + Math.random() * 0.4);
  return Math.max(0, Math.round(jitter));
}

function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name ? `${err.name}: ` : '';
    return `${name}${err.message}`;
  }
  return String(err);
}

type WorkerPostResult = {
  ok: boolean;
  status: number;
  text: string;
};

async function postWorkerJson(
  path: string,
  payload: unknown,
  label: string,
  extraLog: string,
  deps: PostCallCompleteDeps = {},
): Promise<WorkerPostResult | null> {
  const env = deps.env ?? process.env;
  const baseUrl = env.API_BASE_URL?.replace(/\/$/, '');
  const secret = env.WORKER_CALLBACK_SECRET;
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const makeSignal = deps.abortSignal ?? ((ms: number) => AbortSignal.timeout(ms));

  if (!baseUrl || !secret) {
    console.warn(
      `[agent] skip ${label} (API_BASE_URL or WORKER_CALLBACK_SECRET unset) ${extraLog}`,
    );
    return null;
  }

  const timeoutMs = parseEnvInt(
    env.COMPLETE_CALLBACK_TIMEOUT_MS,
    DEFAULT_COMPLETE_CALLBACK_TIMEOUT_MS,
    1,
  );
  const maxAttempts = parseEnvInt(
    env.COMPLETE_CALLBACK_MAX_ATTEMPTS,
    DEFAULT_COMPLETE_CALLBACK_MAX_ATTEMPTS,
    1,
  );
  const backoffBaseMs = parseEnvInt(
    env.COMPLETE_CALLBACK_BACKOFF_MS,
    DEFAULT_COMPLETE_CALLBACK_BACKOFF_MS,
    0,
  );

  const url = `${baseUrl}${path}`;
  const body = JSON.stringify(payload);
  let lastReason = 'unknown';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await doFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Worker-Secret': secret,
        },
        body,
        signal: makeSignal(timeoutMs),
      });
      const text = await res.text().catch(() => '');
      if (res.ok) {
        console.log(
          `[agent] ${label} ok ${extraLog}` +
            (attempt > 1 ? ` attempts=${attempt}` : ''),
        );
        return { ok: true, status: res.status, text };
      }
      lastReason = `HTTP ${res.status}`;
      const retryable = isRetryableCompleteStatus(res.status);
      if (!retryable || attempt === maxAttempts) {
        console.error(
          `[agent] ${label} failed status=${res.status} ${extraLog} ` +
            `attempt=${attempt}/${maxAttempts} body=${text.slice(0, 500)}`,
        );
        return { ok: false, status: res.status, text };
      }
      console.warn(
        `[agent] ${label} retry attempt=${attempt + 1}/${maxAttempts} ` +
          `${extraLog} reason=${lastReason} body=${text.slice(0, 200)}`,
      );
    } catch (err) {
      lastReason = errorMessage(err);
      if (attempt === maxAttempts) {
        console.error(
          `[agent] ${label} error ${extraLog} ` +
            `attempt=${attempt}/${maxAttempts}: ${lastReason}`,
        );
        return null;
      }
      console.warn(
        `[agent] ${label} retry attempt=${attempt + 1}/${maxAttempts} ` +
          `${extraLog} reason=${lastReason}`,
      );
    }
    await sleep(backoffMs(attempt - 1, backoffBaseMs));
  }
  return null;
}

/**
 * POST complete. Callers must not depend on throw-on-failure — this always
 * resolves so failedEarly still reaches ctx.shutdown.
 */
export async function postCallComplete(
  callId: string,
  payload: CompleteCallPayload,
  deps: PostCallCompleteDeps = {},
): Promise<void> {
  await postWorkerJson(
    `/api/internal/calls/${callId}/complete`,
    payload,
    'call complete',
    `callId=${callId} status=${payload.status}`,
    deps,
  );
}

/**
 * Upsert an inbound SIP `calls` row so complete can use the existing
 * `/internal/calls/:id/complete` path. Never throws.
 */
export async function postInboundEnsure(
  payload: InboundEnsurePayload,
  deps: PostCallCompleteDeps = {},
): Promise<string | undefined> {
  const result = await postWorkerJson(
    '/api/internal/calls/inbound',
    payload,
    'inbound ensure',
    `room=${payload.roomName}`,
    deps,
  );
  if (!result?.ok || !result.text.trim()) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(result.text) as { id?: unknown };
    return typeof parsed.id === 'string' && parsed.id.trim()
      ? parsed.id.trim()
      : undefined;
  } catch {
    console.warn(
      `[agent] inbound ensure: response was not JSON with id room=${payload.roomName}`,
    );
    return undefined;
  }
}

/** Best-effort serialize LiveKit ChatContext / session.history. */
export function serializeTranscript(history: {
  toJSON?: (opts?: { excludeTimestamp?: boolean }) => unknown;
  items?: unknown[];
}): CompleteCallPayload['transcript'] {
  try {
    if (typeof history.toJSON === 'function') {
      const json = history.toJSON({ excludeTimestamp: false }) as {
        items?: Array<Record<string, unknown>>;
      };
      const items = Array.isArray(json?.items) ? json.items : [];
      return items
        .map((item) => {
          const role = String(item.role ?? item.type ?? 'unknown');
          let content = '';
          if (typeof item.content === 'string') {
            content = item.content;
          } else if (Array.isArray(item.content)) {
            content = item.content
              .map((c) => {
                if (typeof c === 'string') return c;
                if (c && typeof c === 'object' && 'text' in c) {
                  return String((c as { text: unknown }).text ?? '');
                }
                return '';
              })
              .filter(Boolean)
              .join(' ');
          } else if (typeof item.text === 'string') {
            content = item.text;
          }
          return {
            role,
            content,
            createdAt:
              typeof item.createdAt === 'number' || typeof item.createdAt === 'string'
                ? item.createdAt
                : null,
            id: typeof item.id === 'string' ? item.id : undefined,
          };
        })
        .filter((m) => m.content.trim().length > 0 || m.role === 'assistant');
    }
  } catch (err) {
    console.warn('[agent] serializeTranscript failed', err);
  }
  return [];
}

export function serializeUsage(usage: {
  modelUsage?: unknown[];
}): Record<string, unknown> | null {
  try {
    if (!usage) return null;
    return {
      models: Array.isArray(usage.modelUsage) ? usage.modelUsage : [],
    };
  } catch {
    return null;
  }
}
