import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SendEmailParams, SendEmailResult } from './email.types';

const DEFAULT_FROM = 'Speeko <hello@speeko.ai>';
const DEFAULT_API_BASE = 'https://next-api.useplunk.com';
const ERROR_BODY_LOG_LIMIT = 400;

type PlunkFrom = string | { name: string; email: string };

type PlunkFieldError = {
  field?: string;
  message?: string;
  code?: string;
};

type PlunkSendResponse = {
  success?: boolean;
  data?: {
    emails?: Array<{ email?: string }>;
  };
  error?: {
    message?: string;
    code?: string;
    requestId?: string;
    suggestion?: string;
    errors?: PlunkFieldError[];
  };
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string;
  private readonly apiBase: string;
  private readonly defaultFrom: string;
  private readonly notifyTo: string | null;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('PLUNK_API_KEY')?.trim() ?? '';
    this.apiBase = normalizePlunkApiBase(
      this.config.get<string>('PLUNK_API_BASE'),
    );
    this.defaultFrom =
      this.config.get<string>('EMAIL_FROM')?.trim() || DEFAULT_FROM;
    const notify = this.config.get<string>('EMAIL_NOTIFY_TO')?.trim() ?? '';
    this.notifyTo = notify || null;

    if (!this.apiKey) {
      this.logger.warn(
        'Email disabled: PLUNK_API_KEY is not set. EmailService.send() will no-op.',
      );
    }
  }

  /** Optional platform inbox for future contact/lead notifications. */
  getNotifyTo(): string | null {
    return this.notifyTo;
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Generic send via Plunk. Never throws — failures return `{ ok: false }`
   * so product flows (invite, reset, contact) are not blocked by mail.
   */
  async send(params: SendEmailParams): Promise<SendEmailResult> {
    if (!this.apiKey) {
      this.logger.warn(
        `EmailService.send skipped: PLUNK_API_KEY not set subject="${params.subject?.trim() || ''}"`,
      );
      return { ok: false, skipped: true, error: 'email disabled' };
    }

    const text = params.text?.trim() || undefined;
    const html = params.html?.trim() || undefined;
    if (!text && !html) {
      this.logger.warn('EmailService.send rejected: text or html required');
      return { ok: false, error: 'text or html is required' };
    }

    const subject = params.subject?.trim();
    if (!subject) {
      this.logger.warn('EmailService.send rejected: subject required');
      return { ok: false, error: 'subject is required' };
    }

    const to = normalizeTo(params.to);
    if (!to) {
      this.logger.warn('EmailService.send rejected: to required');
      return { ok: false, error: 'to is required' };
    }

    const from = parseFromHeader(params.from?.trim() || this.defaultFrom);
    const body = html ?? textToHtml(text ?? '');
    const reply = firstReplyTo(params.replyTo);

    const payload: Record<string, unknown> = {
      to,
      subject,
      body,
      from,
    };
    if (reply) payload.reply = reply;

    try {
      const res = await fetch(`${this.apiBase}/v1/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const rawText = await res.text();
      const json = parseJson(rawText) as PlunkSendResponse | null;

      if (!res.ok) {
        const message =
          json?.error?.message ||
          `plunk send ${res.status}${rawText ? `: ${truncate(rawText)}` : ''}`;
        const fields = formatFieldErrors(json?.error?.errors);
        const suggestion = json?.error?.suggestion
          ? ` suggestion=${json.error.suggestion}`
          : '';
        this.logger.warn(
          `Email send failed: status=${res.status} code=${json?.error?.code ?? 'n/a'} requestId=${json?.error?.requestId ?? 'n/a'}${fields}${suggestion} body=${truncate(rawText)}`,
        );
        return { ok: false, error: message };
      }

      const id = json?.data?.emails?.[0]?.email ?? 'unknown';
      this.logger.log(`Email sent id=${id} subject="${subject}"`);
      return { ok: true, id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Email send threw: ${message}`);
      return { ok: false, error: message };
    }
  }

  /** Convenience wrapper for plain-text mail. */
  async sendText(
    to: string | string[],
    subject: string,
    text: string,
  ): Promise<SendEmailResult> {
    return this.send({ to, subject, text });
  }
}

function normalizePlunkApiBase(raw: string | undefined): string {
  let base = raw?.trim() || DEFAULT_API_BASE;
  base = base.replace(/\/+$/, '');
  base = base.replace(/\/v1\/send$/i, '');
  base = base.replace(/\/+$/, '');
  return base || DEFAULT_API_BASE;
}

function normalizeTo(to: string | string[]): string | string[] | null {
  if (Array.isArray(to)) {
    const cleaned = to.map((item) => item.trim()).filter(Boolean);
    return cleaned.length ? cleaned : null;
  }
  const single = to?.trim();
  return single || null;
}

function parseFromHeader(raw: string): PlunkFrom {
  const match = raw.match(/^(.*)<([^>]+)>\s*$/);
  if (!match) {
    return raw;
  }
  const name = match[1].trim().replace(/^["']|["']$/g, '');
  const email = match[2].trim();
  return name ? { name, email } : email;
}

function firstReplyTo(replyTo?: string | string[]): string | undefined {
  if (!replyTo) return undefined;
  if (Array.isArray(replyTo)) {
    const first = replyTo.map((item) => item.trim()).find(Boolean);
    return first;
  }
  return replyTo.trim() || undefined;
}

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<p style="white-space:pre-wrap;font-family:sans-serif">${escaped}</p>`;
}

function parseJson(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function formatFieldErrors(errors: PlunkFieldError[] | undefined): string {
  if (!errors?.length) return '';
  const parts = errors
    .map((item) => {
      const field = item.field?.trim() || 'unknown';
      const message = item.message?.trim() || item.code || 'invalid';
      return `${field}: ${message}`;
    })
    .filter(Boolean);
  return parts.length ? ` fields=${parts.join('; ')}` : '';
}

function truncate(value: string): string {
  if (value.length <= ERROR_BODY_LOG_LIMIT) return value;
  return `${value.slice(0, ERROR_BODY_LOG_LIMIT)}…`;
}
