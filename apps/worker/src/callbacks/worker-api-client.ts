/**
 * HTTP transport for worker → Nest internal APIs.
 * Retries transient failures (5xx / 408 / 429 / network / abort) with a
 * per-attempt timeout so a hung fetch cannot pin the LiveKit job process.
 * Never throws — callers still reach job shutdown after exhaustion.
 * No-ops when API_BASE_URL or WORKER_CALLBACK_SECRET is missing.
 */

import { parseEnvInt, resolveWorkerApiConfig } from '../common/env.js';
import { exponentialBackoffMs, isRetryableHttpStatus } from '../common/retry.js';

export const DEFAULT_COMPLETE_CALLBACK_TIMEOUT_MS = 8_000;
export const DEFAULT_COMPLETE_CALLBACK_MAX_ATTEMPTS = 5;
export const DEFAULT_COMPLETE_CALLBACK_BACKOFF_MS = 500;
export const COMPLETE_CALLBACK_BACKOFF_CAP_MS = 4_000;

export type WorkerPostResult = {
  ok: boolean;
  status: number;
  text: string;
};

export type WorkerApiClientDeps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  env?: NodeJS.ProcessEnv;
  abortSignal?: (timeoutMs: number) => AbortSignal;
};

export class WorkerApiClient {
  constructor(private readonly deps: WorkerApiClientDeps = {}) {}

  async postJson(
    path: string,
    payload: unknown,
    label: string,
    extraLog: string,
  ): Promise<WorkerPostResult | null> {
    const env = this.deps.env ?? process.env;
    const api = resolveWorkerApiConfig(env);
    const doFetch = this.deps.fetch ?? fetch;
    const sleep = this.deps.sleep ?? this.defaultSleep;
    const makeSignal =
      this.deps.abortSignal ?? ((ms: number) => AbortSignal.timeout(ms));

    if (!api) {
      console.warn(
        `[agent] skip ${label} (API_BASE_URL or WORKER_CALLBACK_SECRET unset) ${extraLog}`,
      );
      return null;
    }
    const { baseUrl, secret } = api;

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
        const retryable = isRetryableHttpStatus(res.status);
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
        lastReason = this.errorMessage(err);
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
      await sleep(
        exponentialBackoffMs(
          attempt - 1,
          backoffBaseMs,
          COMPLETE_CALLBACK_BACKOFF_CAP_MS,
        ),
      );
    }
    return null;
  }

  private defaultSleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private errorMessage(err: unknown): string {
    if (err instanceof Error) {
      const name = err.name ? `${err.name}: ` : '';
      return `${name}${err.message}`;
    }
    return String(err);
  }
}
