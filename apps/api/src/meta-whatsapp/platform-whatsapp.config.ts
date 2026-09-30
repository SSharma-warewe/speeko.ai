import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Only the API resolves platform credentials; URL origin/version are validated. */
@Injectable()
export class PlatformWhatsAppConfig {
  constructor(private readonly config: ConfigService) {}
  resolve() {
    const token = this.config.get<string>('WHATSAPP_API_KEY')?.trim();
    try {
      const url = new URL(
        this.config.get<string>('WHATSAPP_URL')?.trim() ?? '',
      );
      const match = /^\/(v\d+\.\d+)\/(\d+)\/messages\/?$/.exec(url.pathname);
      if (
        !token ||
        !match ||
        url.protocol !== 'https:' ||
        url.hostname !== 'graph.facebook.com' ||
        url.port ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        return null;
      return { token, graphVersion: match[1], phoneNumberId: match[2] };
    } catch {
      return null;
    }
  }
  templateName() {
    const name =
      this.config.get<string>('WHATSAPP_OTP_TEMPLATE_NAME')?.trim() ?? '';
    return /^[A-Za-z0-9_]{1,100}$/.test(name) ? name : 'speeko_ai';
  }
}
