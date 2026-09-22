import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WhatsappOtpClient,
  isAllowedMessagesUrl,
} from '../whatsapp-otp.client';

const URL = 'https://graph.facebook.com/v25.0/123/messages';
const KEY = 'graph-token-test';

describe('WhatsappOtpClient', () => {
  let fetchMock: jest.SpyInstance;

  function client(
    env: { url?: string; key?: string; template?: string } = {},
  ): WhatsappOtpClient {
    return new WhatsappOtpClient({
      get: (name: string) => {
        if (name === 'WHATSAPP_URL') return env.url ?? URL;
        if (name === 'WHATSAPP_API_KEY') return env.key ?? KEY;
        if (name === 'WHATSAPP_OTP_TEMPLATE_NAME') return env.template;
        return undefined;
      },
    } as unknown as ConfigService);
  }

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('posts the speeko_ai template with the code in the body and the URL button', async () => {
    fetchMock.mockResolvedValue(new Response('{"messages":[]}', { status: 200 }));

    await client().send('919876543210', '123456');

    expect(fetchMock).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${KEY}`,
        },
      }),
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      messaging_product: 'whatsapp',
      to: '919876543210',
      type: 'template',
      template: {
        name: 'speeko_ai',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: '123456' }],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: '123456' }],
          },
        ],
      },
    });
  });

  it('uses a custom template name when it is a safe token', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    await client({ template: 'speeko_ai_v2' }).send('919876543210', '123456');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body)) as {
      template: { name: string };
    };
    expect(body.template.name).toBe('speeko_ai_v2');
  });

  it('maps Graph errors to a generic 502 that omits the code and the token', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'bad token 123456' } }), {
        status: 400,
      }),
    );

    await expect(client().send('919876543210', '123456')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    await expect(client().send('919876543210', '123456')).rejects.toThrow(
      /Could not send the WhatsApp code/i,
    );
  });

  it('rejects redirects so the bearer is not followed', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 302 }));

    await expect(client().send('919876543210', '123456')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('is not configured for a non-Graph URL', () => {
    expect(client({ url: 'https://evil.example/messages' }).isConfigured()).toBe(
      false,
    );
    expect(client({ url: '   ', key: KEY }).isConfigured()).toBe(false);
    expect(isAllowedMessagesUrl(URL)).toBe(true);
    expect(isAllowedMessagesUrl('http://graph.facebook.com/v25.0/1/messages')).toBe(
      false,
    );
  });
});
