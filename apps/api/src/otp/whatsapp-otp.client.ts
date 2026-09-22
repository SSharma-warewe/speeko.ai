import {
  BadGatewayException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const NOT_CONFIGURED =
  'Phone verification is not configured. Please try again later.';
const SEND_FAILED =
  'Could not send the WhatsApp code. Please try again shortly.';

/**
 * Cloud API template send for get-demo OTP.
 * Lives in the otp module — not the inbound webhook module.
 * Never logs the messages URL, bearer token, or response body (the body echoes the code).
 */
@Injectable()
export class WhatsappOtpClient {
  private readonly logger = new Logger(WhatsappOtpClient.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return this.messagesUrl() !== null && this.apiKey() !== null;
  }

  async send(toDigits: string, code: string): Promise<void> {
    const url = this.messagesUrl();
    const apiKey = this.apiKey();
    if (!url || !apiKey) {
      throw new BadGatewayException(SEND_FAILED);
    }

    const templateName = this.templateName();
    const body = {
      messaging_product: 'whatsapp',
      to: toDigits,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: code }],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: code }],
          },
        ],
      },
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
        body: JSON.stringify(body),
      });
    } catch {
      this.logger.error('WhatsApp OTP send network error');
      throw new BadGatewayException(SEND_FAILED);
    }

    if (response.status >= 300 && response.status < 400) {
      this.logger.error('WhatsApp OTP send was redirected');
      throw new BadGatewayException(SEND_FAILED);
    }

    if (!response.ok) {
      this.logger.error(`WhatsApp OTP send failed status=${response.status}`);
      await response.text().catch(() => '');
      throw new BadGatewayException(SEND_FAILED);
    }

    await response.text().catch(() => '');
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

  private templateName(): string {
    const name =
      this.config.get<string>('WHATSAPP_OTP_TEMPLATE_NAME')?.trim() ?? '';
    if (/^[A-Za-z0-9_]+$/.test(name)) {
      return name;
    }
    return 'speeko_ai';
  }
}

export function isAllowedMessagesUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'graph.facebook.com' &&
      url.pathname.endsWith('/messages') &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

export const WHATSAPP_OTP_NOT_CONFIGURED = NOT_CONFIGURED;
