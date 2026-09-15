import {
  toWhatsAppWebhookConfigResponse,
  toWhatsAppWebhookConfigSecretResponse,
  whatsappCallbackUrl,
} from '../mappers/whatsapp-webhook-config-response.mapper';
import { WhatsAppWebhookConfig } from '../whatsapp-webhook-config.entity';

describe('whatsapp-webhook-config-response.mapper', () => {
  const row = {
    id: 'cfg-id',
    organizationId: 'org-id',
    phoneNumberId: '106540352242922',
    wabaId: '102290129340398',
    verifyTokenHash: 'a'.repeat(64),
    verifyTokenPrefix: 'wa_abcd1…',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  } as WhatsAppWebhookConfig;

  it('1. whatsappCallbackUrl joins API_BASE_URL and strips trailing slash', () => {
    expect(whatsappCallbackUrl('https://api.example.com/')).toBe(
      'https://api.example.com/api/webhooks/whatsapp',
    );
    expect(whatsappCallbackUrl('')).toBe('/api/webhooks/whatsapp');
    expect(whatsappCallbackUrl(undefined)).toBe('/api/webhooks/whatsapp');
  });

  it('2. public mapper never includes hash or raw token', () => {
    const dto = toWhatsAppWebhookConfigResponse(
      row,
      'https://api.example.com/api/webhooks/whatsapp',
    );

    expect(dto).not.toHaveProperty('verifyToken');
    expect(dto).not.toHaveProperty('verifyTokenHash');
    expect(JSON.stringify(dto)).not.toContain(row.verifyTokenHash);
    expect(dto.verifyTokenPrefix).toBe('wa_abcd1…');
    expect(dto.callbackUrl).toBe(
      'https://api.example.com/api/webhooks/whatsapp',
    );
  });

  it('3. secret mapper adds verifyToken once and still omits the hash', () => {
    const dto = toWhatsAppWebhookConfigSecretResponse(
      row,
      '/api/webhooks/whatsapp',
      'wa_secret',
    );

    expect(dto.verifyToken).toBe('wa_secret');
    expect(dto).not.toHaveProperty('verifyTokenHash');
  });
});
