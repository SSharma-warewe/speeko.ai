import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend, type CreateEmailOptions } from 'resend';
import type { SendEmailParams, SendEmailResult } from './email.types';

const DEFAULT_FROM = 'Speeko <onboarding@resend.dev>';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: Resend | null;
  private readonly defaultFrom: string;
  private readonly notifyTo: string | null;
  private disabledLogged = false;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim() ?? '';
    this.client = apiKey ? new Resend(apiKey) : null;
    this.defaultFrom =
      this.config.get<string>('EMAIL_FROM')?.trim() || DEFAULT_FROM;
    const notify = this.config.get<string>('EMAIL_NOTIFY_TO')?.trim() ?? '';
    this.notifyTo = notify || null;

    if (!this.client) {
      this.logger.warn(
        'Email disabled: RESEND_API_KEY is not set. EmailService.send() will no-op.',
      );
    }
  }

  /** Optional platform inbox for future contact/lead notifications. */
  getNotifyTo(): string | null {
    return this.notifyTo;
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  /**
   * Generic send via Resend. Never throws — failures return `{ ok: false }`
   * so product flows (signup, contact, etc.) are not blocked by mail.
   *
   * Until a custom domain is verified, Resend only delivers to the account
   * owner address; other recipients may fail — still pass the real `to`.
   */
  async send(params: SendEmailParams): Promise<SendEmailResult> {
    if (!this.client) {
      if (!this.disabledLogged) {
        this.logger.warn('EmailService.send skipped: RESEND_API_KEY not set');
        this.disabledLogged = true;
      }
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

    const to = params.to;
    if (
      !to ||
      (Array.isArray(to) && to.length === 0) ||
      (typeof to === 'string' && !to.trim())
    ) {
      this.logger.warn('EmailService.send rejected: to required');
      return { ok: false, error: 'to is required' };
    }

    const from = params.from?.trim() || this.defaultFrom;

    // Resend CreateEmailOptions requires at least one of text | html | react.
    const payload = {
      from,
      to,
      subject,
      ...(text ? { text } : {}),
      ...(html ? { html } : {}),
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
      ...(params.tags?.length ? { tags: params.tags } : {}),
    } as CreateEmailOptions;

    try {
      const { data, error } = await this.client.emails.send(payload);

      if (error) {
        const message = error.message || JSON.stringify(error);
        this.logger.warn(`Email send failed: ${message}`);
        return { ok: false, error: message };
      }

      const id = data?.id ?? 'unknown';
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
