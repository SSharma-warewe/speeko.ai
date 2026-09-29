import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GRAPH_ORIGIN = 'https://graph.facebook.com';
const DEFAULT_GRAPH_VERSION = 'v25.0';
const TEMPLATE_PAGE_LIMIT = 100;
const MAX_TEMPLATE_PAGES = 5;
const REQUEST_TIMEOUT_MS = 15_000;
const ERROR_TEXT_LIMIT = 240;

export type MetaTemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  buttons?: MetaTemplateButton[];
  example?: Record<string, unknown>;
  [key: string]: unknown;
};

export type MetaTemplateButton = {
  type?: string;
  text?: string;
  url?: string;
  example?: unknown;
  [key: string]: unknown;
};

export type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  parameter_format?: string;
  components: MetaTemplateComponent[];
};

export type MetaResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

export type MetaSendTemplateInput = {
  token: string;
  phoneNumberId: string;
  /** Recipient, digits only. */
  to: string;
  templateName: string;
  language: string;
  components: unknown[];
};

/**
 * Thin Meta WhatsApp Cloud (Graph) client for org-owned credentials.
 * Only talks to graph.facebook.com, refuses redirects, and never logs the
 * access token, recipient numbers, or message bodies.
 */
@Injectable()
export class MetaWhatsAppClient {
  private readonly logger = new Logger(MetaWhatsAppClient.name);

  constructor(private readonly config: ConfigService) {}

  /** Approved-or-not templates for a WABA (paged, capped). */
  async listTemplates(input: {
    token: string;
    wabaId: string;
  }): Promise<MetaResult<MetaTemplate[]>> {
    const templates: MetaTemplate[] = [];
    let after: string | null = null;
    for (let page = 0; page < MAX_TEMPLATE_PAGES; page += 1) {
      const params = new URLSearchParams({
        fields:
          'name,status,language,category,components,parameter_format',
        limit: String(TEMPLATE_PAGE_LIMIT),
      });
      if (after) params.set('after', after);
      const res = await this.request<GraphList>(
        'GET',
        `/${encodeURIComponent(input.wabaId)}/message_templates?${params.toString()}`,
        input.token,
      );
      if (!res.ok) return res;
      for (const raw of res.data.data ?? []) {
        const t = toTemplate(raw);
        if (t) templates.push(t);
      }
      after = res.data.paging?.next
        ? (res.data.paging.cursors?.after ?? null)
        : null;
      if (!after) break;
    }
    return { ok: true, data: templates };
  }

  /** Connection test: read the sender phone number. */
  async getPhoneNumber(input: {
    token: string;
    phoneNumberId: string;
  }): Promise<MetaResult<{ displayPhoneNumber: string | null }>> {
    const res = await this.request<{ display_phone_number?: unknown }>(
      'GET',
      `/${encodeURIComponent(input.phoneNumberId)}?fields=display_phone_number,verified_name`,
      input.token,
    );
    if (!res.ok) return res;
    const display = res.data.display_phone_number;
    return {
      ok: true,
      data: {
        displayPhoneNumber:
          typeof display === 'string' && display.trim() ? display.trim() : null,
      },
    };
  }

  async sendTemplate(
    input: MetaSendTemplateInput,
  ): Promise<MetaResult<{ wamid: string | null }>> {
    const body = {
      messaging_product: 'whatsapp',
      to: input.to,
      type: 'template',
      template: {
        name: input.templateName,
        language: { code: input.language },
        ...(input.components.length > 0
          ? { components: input.components }
          : {}),
      },
    };
    const res = await this.request<{ messages?: { id?: unknown }[] }>(
      'POST',
      `/${encodeURIComponent(input.phoneNumberId)}/messages`,
      input.token,
      body,
    );
    if (!res.ok) return res;
    const id = res.data.messages?.[0]?.id;
    return {
      ok: true,
      data: { wamid: typeof id === 'string' && id ? id : null },
    };
  }

  private graphBase(): string {
    const version =
      this.config.get<string>('META_GRAPH_API_VERSION')?.trim() ?? '';
    return `${GRAPH_ORIGIN}/${/^v\d+\.\d+$/.test(version) ? version : DEFAULT_GRAPH_VERSION}`;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    token: string,
    body?: unknown,
  ): Promise<MetaResult<T>> {
    const accessToken = token.trim();
    if (!accessToken) {
      return { ok: false, status: 0, message: 'Missing WhatsApp access token.' };
    }
    let response: Response;
    try {
      response = await fetch(`${this.graphBase()}${path}`, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      this.logger.warn(`Meta WhatsApp ${method} network error`);
      return {
        ok: false,
        status: 0,
        message: 'Could not reach Meta. Try again.',
      };
    }

    if (response.status >= 300 && response.status < 400) {
      this.logger.warn(`Meta WhatsApp ${method} was redirected`);
      return { ok: false, status: response.status, message: 'Unexpected redirect from Meta.' };
    }

    const text = await response.text().catch(() => '');
    const json = parseJson(text);
    if (!response.ok) {
      const message = metaErrorMessage(json, response.status);
      this.logger.warn(
        `Meta WhatsApp ${method} failed status=${response.status}`,
      );
      return { ok: false, status: response.status, message };
    }
    return { ok: true, data: (json ?? {}) as T };
  }
}

type GraphList = {
  data?: unknown[];
  paging?: { next?: string; cursors?: { after?: string } };
};

function parseJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Meta's `error.message` is user-safe (no secrets); trim + prefix the code. */
function metaErrorMessage(
  json: Record<string, unknown> | null,
  status: number,
): string {
  const error = json?.error;
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; code?: unknown; error_data?: unknown };
    const message = typeof e.message === 'string' ? e.message.trim() : '';
    const details =
      e.error_data && typeof e.error_data === 'object'
        ? (e.error_data as { details?: unknown }).details
        : undefined;
    const detail = typeof details === 'string' ? details.trim() : '';
    const code = typeof e.code === 'number' ? ` (code ${e.code})` : '';
    const combined = [message, detail].filter(Boolean).join(' - ');
    if (combined) return `${combined.slice(0, ERROR_TEXT_LIMIT)}${code}`;
  }
  if (status === 401 || status === 403) {
    return 'Meta rejected the access token. Check its permissions.';
  }
  return `Meta request failed (${status}).`;
}

function toTemplate(raw: unknown): MetaTemplate | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const t = raw as Record<string, unknown>;
  const name = typeof t.name === 'string' ? t.name : '';
  const language = typeof t.language === 'string' ? t.language : '';
  if (!name || !language) return null;
  return {
    id: typeof t.id === 'string' ? t.id : `${name}:${language}`,
    name,
    language,
    category: typeof t.category === 'string' ? t.category : '',
    status: typeof t.status === 'string' ? t.status : '',
    parameter_format:
      typeof t.parameter_format === 'string' ? t.parameter_format : undefined,
    components: Array.isArray(t.components)
      ? (t.components as MetaTemplateComponent[])
      : [],
  };
}
