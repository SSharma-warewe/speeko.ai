/**
 * HTTP client for worker calendar tools → Nest internal calendar proxy.
 * Uses the same API_BASE_URL + WORKER_CALLBACK_SECRET as call complete.
 */

import { recordToolEvent, sanitizeForStorage } from './tool-events.js';
import type { SessionUserData } from './types.js';

export type CalendarToolResult = {
  ok: boolean;
  message?: string;
  error?: string;
  data?: unknown;
};

function bridgeConfig():
  | { baseUrl: string; secret: string }
  | { error: string } {
  const baseUrl = process.env.API_BASE_URL?.replace(/\/$/, '');
  const secret = process.env.WORKER_CALLBACK_SECRET;
  if (!baseUrl || !secret) {
    return {
      error:
        'Calendar bridge not configured on the worker (API_BASE_URL or WORKER_CALLBACK_SECRET missing). Tell the customer you cannot access the calendar right now.',
    };
  }
  return { baseUrl, secret };
}

export async function callCalendarApi(
  callId: string | undefined,
  path: string,
  body: Record<string, unknown>,
  opts?: {
    userData?: SessionUserData;
    toolId?: string;
    /** Default `calendar` (Nylas). Use `ghl-calendar` for platform GHL tools. */
    namespace?: 'calendar' | 'ghl-calendar';
  },
): Promise<CalendarToolResult> {
  const toolId = opts?.toolId ?? `calendar:${path}`;
  const started = Date.now();

  const finish = (result: CalendarToolResult, args?: unknown): CalendarToolResult => {
    if (opts?.userData) {
      recordToolEvent(opts.userData, {
        toolId,
        args: args ?? sanitizeForStorage(body),
        result,
        ok: result.ok,
        error: result.error,
        summary: result.message?.slice(0, 240),
        durationMs: Date.now() - started,
      });
    } else {
      const okLabel = result.ok ? 'ok' : 'fail';
      console.log(
        `[tool:calendar] path=${path} callId=${callId ?? 'n/a'} → ${okLabel}` +
          `${result.error ? ` error=${result.error}` : ''}` +
          ` ${(result.message ?? '').slice(0, 160)}`,
      );
    }
    return result;
  };

  if (!callId) {
    return finish({
      ok: false,
      error: 'missing_call_id',
      message:
        'No call id on this session — calendar tools cannot run. Apologize and offer to take a note or schedule offline.',
    });
  }

  const cfg = bridgeConfig();
  if ('error' in cfg) {
    return finish({
      ok: false,
      error: 'bridge_unconfigured',
      message: cfg.error,
    });
  }

  const ns = opts?.namespace ?? 'calendar';
  const url = `${cfg.baseUrl}/api/internal/calls/${callId}/${ns}/${path}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': cfg.secret,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => '');
    let json: CalendarToolResult | null = null;
    if (text) {
      try {
        json = JSON.parse(text) as CalendarToolResult;
      } catch {
        json = null;
      }
    }
    if (!res.ok) {
      console.error(
        `[tool:calendar] HTTP ${res.status} path=${path} callId=${callId} body=${text.slice(0, 300)}`,
      );
      return finish({
        ok: false,
        error: 'http_error',
        message:
          (json && (json.message || json.error)) ||
          `Calendar API failed (${res.status}). Do not invent availability; ask to try again or offer a callback.`,
      });
    }
    if (!json || typeof json.ok !== 'boolean') {
      return finish({
        ok: false,
        error: 'bad_response',
        message: 'Unexpected calendar API response.',
      });
    }
    return finish(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tool:calendar] error path=${path} callId=${callId}: ${message}`);
    return finish({
      ok: false,
      error: 'network_error',
      message: `Could not reach calendar service: ${message}. Do not invent free times or confirm bookings.`,
    });
  }
}
