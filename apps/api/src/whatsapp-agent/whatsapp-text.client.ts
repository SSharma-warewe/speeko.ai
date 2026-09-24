import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAllowedMessagesUrl } from '../otp/whatsapp-otp.client';

const MAX_TEXT_CHARS = 4096;

/**
 * Cloud API session text. The OTP client only sends templates.
 * Never logs the messages URL, bearer token, or message body.
 */
@Injectable()
export class WhatsAppTextClient {
  private readonly logger = new Logger(WhatsAppTextClient.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return this.messagesUrl() !== null && this.apiKey() !== null;
  }

  async sendText(to: string, body: string): Promise<boolean> {
    const url = this.messagesUrl();
    const apiKey = this.apiKey();
    const text = body.trim().slice(0, MAX_TEXT_CHARS);
    if (!url || !apiKey || !text) {
      return false;
    }

    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch {
      this.logger.error('WhatsApp text send network error');
      return false;
    }

    if (response.status >= 300 && response.status < 400) {
      this.logger.error('WhatsApp text send was redirected');
      return false;
    }

    if (!response.ok) {
      this.logger.error(`WhatsApp text send failed status=${response.status}`);
      await response.text().catch(() => '');
      return false;
    }

    await response.text().catch(() => '');
    return true;
  }

  private messagesUrl(): string | null {
    const raw = this.config.get<string>('WHATSAPP_URL')?.trim() ?? '';
    if (!raw || !isAllowedMessagesUrl(raw)) {
      return null;
    }
    return raw;
  }

  private apiKey(): string | null {
    const key = this.config.get<string>('WHATSAPP_API_KEY')?.trim() ?? '';
    return key || null;
  }
}
