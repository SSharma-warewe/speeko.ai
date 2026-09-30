import { ConfigService } from '@nestjs/config';
import { PlatformWhatsAppConfig } from '../platform-whatsapp.config';
describe('Platform WhatsApp configuration', () => {
  it('resolves phone and version without changing platform settings', () => {
    const config = new PlatformWhatsAppConfig(
      new ConfigService({
        WHATSAPP_URL: 'https://graph.facebook.com/v22.0/12345678/messages',
        WHATSAPP_API_KEY: 'secret',
      }),
    );
    expect(config.resolve()).toEqual({
      token: 'secret',
      phoneNumberId: '12345678',
      graphVersion: 'v22.0',
    });
    expect(config.templateName()).toBe('speeko_ai');
  });
  it.each([
    'https://evil.invalid/v22.0/123/messages',
    'http://graph.facebook.com/v22.0/123/messages',
    'https://graph.facebook.com/v22.0/123/messages?token=x',
    'https://user@graph.facebook.com/v22.0/123/messages',
    'https://graph.facebook.com/v22.0/word/messages',
  ])('rejects %s', (url) => {
    expect(
      new PlatformWhatsAppConfig(
        new ConfigService({ WHATSAPP_URL: url, WHATSAPP_API_KEY: 'secret' }),
      ).resolve(),
    ).toBeNull();
  });
});
