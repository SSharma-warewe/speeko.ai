/**
 * POST call completion (transcript / usage / task result / tool events) back to the Nest API.
 * No-ops when API_BASE_URL or WORKER_CALLBACK_SECRET is missing.
 */

import type { ToolEvent } from './tools/types.js';

export type CompleteCallPayload = {
  status: 'completed' | 'failed';
  errorMessage?: string | null;
  failureCode?: string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  transcript?: Array<{
    role: string;
    content: string;
    createdAt?: string | number | null;
    id?: string;
  }> | null;
  usage?: Record<string, unknown> | null;
  sessionReport?: Record<string, unknown> | null;
  taskResult?: Record<string, unknown> | null;
  /**
   * True only when the LiveKit task called complete_* (task.run() resolved).
   * API maps completed+true → completed, completed+false → incomplete.
   */
  taskCompleted?: boolean;
  /** Tool invocations during the call (merged into sessionReport on API). */
  toolEvents?: ToolEvent[] | null;
};

export async function postCallComplete(
  callId: string,
  payload: CompleteCallPayload,
): Promise<void> {
  const baseUrl = process.env.API_BASE_URL?.replace(/\/$/, '');
  const secret = process.env.WORKER_CALLBACK_SECRET;

  if (!baseUrl || !secret) {
    console.warn(
      `[agent] skip call complete callback (API_BASE_URL or WORKER_CALLBACK_SECRET unset) callId=${callId}`,
    );
    return;
  }

  const url = `${baseUrl}/api/internal/calls/${callId}/complete`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': secret,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(
        `[agent] call complete failed status=${res.status} callId=${callId} body=${text.slice(0, 500)}`,
      );
      return;
    }
    console.log(`[agent] call complete ok callId=${callId} status=${payload.status}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agent] call complete error callId=${callId}: ${message}`);
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
