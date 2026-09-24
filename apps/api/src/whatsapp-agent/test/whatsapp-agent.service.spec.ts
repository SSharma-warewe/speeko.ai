import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  RECEPTIONIST_REPLY,
  type ReceptionistReply,
} from '../receptionist-reply';
import { WhatsAppAgentService } from '../whatsapp-agent.service';
import { WhatsAppTextClient } from '../whatsapp-text.client';

const PHONE_ID = '106540352242922';
const MESSAGES_URL = `https://graph.facebook.com/v25.0/${PHONE_ID}/messages`;
const FROM = '919876543210';

function textPayload(id = 'wamid.1', phoneNumberId: string = PHONE_ID) {
  return {
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: phoneNumberId },
              messages: [
                {
                  from: FROM,
                  id,
                  type: 'text',
                  text: { body: 'We need voice calls' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('WhatsAppAgentService', () => {
  let service: WhatsAppAgentService;
  let receptionist: jest.Mocked<ReceptionistReply>;
  let configGet: jest.Mock;
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    configGet = jest.fn((key: string) => {
      if (key === 'WHATSAPP_URL') return MESSAGES_URL;
      if (key === 'WHATSAPP_API_KEY') return 'wa-secret';
      if (key === 'OPENROUTER_API_KEY') return 'or-secret';
      return undefined;
    });
    receptionist = {
      reply: jest.fn().mockResolvedValue("Hi! I'd be happy to help."),
    };
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    });
    global.fetch = fetchMock;

    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsAppAgentService,
        WhatsAppTextClient,
        { provide: ConfigService, useValue: { get: configGet } },
        { provide: RECEPTIONIST_REPLY, useValue: receptionist },
      ],
    }).compile();
    service = moduleRef.get(WhatsAppAgentService);
  });

  it('posts a Cloud API text body to the sender', async () => {
    await service.replyToWebhook(textPayload());

    expect(receptionist.reply).toHaveBeenCalledWith(FROM, 'We need voice calls');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(MESSAGES_URL);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      messaging_product: 'whatsapp',
      to: FROM,
      type: 'text',
      text: { body: "Hi! I'd be happy to help." },
    });
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer wa-secret');
  });

  it('does not call the agent for status or non-text payloads', async () => {
    await service.replyToWebhook({
      entry: [
        {
          changes: [
            {
              value: { statuses: [{ id: 'wamid.status', status: 'delivered' }] },
            },
          ],
        },
      ],
    });
    await service.replyToWebhook(textPayload());
    const image = textPayload();
    const message = image.entry[0].changes[0].value.messages[0] as {
      type: string;
    };
    message.type = 'image';

    await service.replyToWebhook(image);

    expect(receptionist.reply).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not send a second reply for the same message id', async () => {
    await service.replyToWebhook(textPayload('wamid.same'));
    await service.replyToWebhook(textPayload('wamid.same'));

    expect(receptionist.reply).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not throw when OpenRouter or WhatsApp config is missing', async () => {
    configGet.mockImplementation((key: string) =>
      key === 'WHATSAPP_URL' ? MESSAGES_URL : undefined,
    );
    await expect(service.replyToWebhook(textPayload())).resolves.toBeUndefined();

    configGet.mockImplementation((key: string) => {
      if (key === 'OPENROUTER_API_KEY') return 'or-secret';
      if (key === 'WHATSAPP_API_KEY') return 'wa-secret';
      return '';
    });
    await expect(service.replyToWebhook(textPayload())).resolves.toBeUndefined();

    expect(receptionist.reply).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips a webhook for a different phone number id', async () => {
    await service.replyToWebhook(textPayload('wamid.other', '999'));

    expect(receptionist.reply).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
