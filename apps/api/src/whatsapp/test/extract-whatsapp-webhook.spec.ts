import {
  extractWhatsAppWebhook,
  isWebhookPayloadObject,
} from '../lib/extract-whatsapp-webhook';

const samplePayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '102290129340398',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15550783881',
              phone_number_id: '106540352242922',
            },
            messages: [{ type: 'text', text: { body: 'Hello' } }],
          },
        },
      ],
    },
  ],
};

describe('extract-whatsapp-webhook', () => {
  it('1. extracts event type, phone_number_id, and WABA id', () => {
    expect(extractWhatsAppWebhook(samplePayload)).toEqual({
      eventType: 'messages',
      phoneNumberId: '106540352242922',
      wabaId: '102290129340398',
    });
  });

  it('2. returns unknown when entry is missing', () => {
    expect(extractWhatsAppWebhook({ object: 'whatsapp_business_account' })).toEqual({
      eventType: 'unknown',
      phoneNumberId: null,
      wabaId: null,
    });
  });

  it('3. isWebhookPayloadObject accepts objects and empty Meta pings', () => {
    expect(isWebhookPayloadObject(samplePayload)).toBe(true);
    expect(isWebhookPayloadObject({ object: 'whatsapp_business_account' })).toBe(
      true,
    );
    expect(isWebhookPayloadObject({})).toBe(true);
  });

  it('4. isWebhookPayloadObject rejects non-objects and non-array entry', () => {
    expect(isWebhookPayloadObject(null)).toBe(false);
    expect(isWebhookPayloadObject('x')).toBe(false);
    expect(isWebhookPayloadObject([])).toBe(false);
    expect(isWebhookPayloadObject({ entry: {} })).toBe(false);
  });
});
