import { ConfigService } from '@nestjs/config';
import { MetaWhatsAppClient } from '../meta-whatsapp.client';

describe('MetaWhatsAppClient', () => {
  const TOKEN = 'EAAG_meta_secret_token';
  let fetchMock: jest.SpyInstance;

  function makeClient(version?: string): MetaWhatsAppClient {
    const config = {
      get: jest.fn((k: string) =>
        k === 'META_GRAPH_API_VERSION' ? version : undefined,
      ),
    } as unknown as ConfigService;
    const client = new MetaWhatsAppClient(config);
    const logger = (client as unknown as { logger: { warn: () => void } })
      .logger;
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    return client;
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('lists templates from the WABA with fields and a Bearer token', async () => {
    fetchMock.mockResolvedValue(
      json({
        data: [
          {
            id: '1',
            name: 'reminder',
            language: 'en_US',
            category: 'UTILITY',
            status: 'APPROVED',
            components: [{ type: 'BODY', text: 'Hi' }],
          },
          { bogus: true },
        ],
      }),
    );
    const result = await makeClient().listTemplates({
      token: ` ${TOKEN} `,
      wabaId: '1022901293',
    });
    expect(result.ok && result.data).toHaveLength(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://graph.facebook.com');
    expect(parsed.pathname).toBe('/v25.0/1022901293/message_templates');
    expect(parsed.searchParams.get('fields')).toContain('components');
    expect(init.redirect).toBe('manual');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it('follows paging cursors and stops when there is no next page', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({
          data: [{ name: 'a', language: 'en', status: 'APPROVED' }],
          paging: { next: 'https://…', cursors: { after: 'CUR1' } },
        }),
      )
      .mockResolvedValueOnce(
        json({ data: [{ name: 'b', language: 'en', status: 'APPROVED' }] }),
      );
    const result = await makeClient().listTemplates({
      token: TOKEN,
      wabaId: '123456',
    });
    expect(result.ok && result.data.map((t) => t.name)).toEqual(['a', 'b']);
    expect(
      new URL(fetchMock.mock.calls[1][0] as string).searchParams.get('after'),
    ).toBe('CUR1');
  });

  it('honours META_GRAPH_API_VERSION when valid, ignores garbage', async () => {
    fetchMock.mockResolvedValue(json({ data: [] }));
    await makeClient('v30.0').listTemplates({ token: TOKEN, wabaId: '123456' });
    await makeClient('not-a-version').listTemplates({
      token: TOKEN,
      wabaId: '123456',
    });
    expect(new URL(fetchMock.mock.calls[0][0] as string).pathname).toMatch(
      /^\/v30\.0\//,
    );
    expect(new URL(fetchMock.mock.calls[1][0] as string).pathname).toMatch(
      /^\/v25\.0\//,
    );
  });

  it('sends a template payload and returns the wamid', async () => {
    fetchMock.mockResolvedValue(json({ messages: [{ id: 'wamid.XYZ' }] }));
    const result = await makeClient().sendTemplate({
      token: TOKEN,
      phoneNumberId: '1065403522',
      to: '919876543210',
      templateName: 'reminder',
      language: 'en_US',
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ada' }] }],
    });
    expect(result).toEqual({ ok: true, data: { wamid: 'wamid.XYZ' } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/v25.0/1065403522/messages');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      to: '919876543210',
      type: 'template',
      template: {
        name: 'reminder',
        language: { code: 'en_US' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: 'Ada' }] },
        ],
      },
    });
  });

  it('omits components when there are none', async () => {
    fetchMock.mockResolvedValue(json({ messages: [{ id: 'w' }] }));
    await makeClient().sendTemplate({
      token: TOKEN,
      phoneNumberId: '1065403522',
      to: '919876543210',
      templateName: 'hello',
      language: 'en',
      components: [],
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as { template: Record<string, unknown> };
    expect(body.template).not.toHaveProperty('components');
  });

  it('sends a text payload and returns the wamid', async () => {
    fetchMock.mockResolvedValue(json({ messages: [{ id: 'wamid.TXT' }] }));
    const result = await makeClient().sendText({
      token: TOKEN,
      phoneNumberId: '1065403522',
      to: '919876543210',
      body: '  Hello there  ',
    });
    expect(result).toEqual({ ok: true, data: { wamid: 'wamid.TXT' } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/v25.0/1065403522/messages');
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      to: '919876543210',
      type: 'text',
      text: { body: 'Hello there' },
    });
    expect(String(init.body)).not.toContain(TOKEN);
  });

  it('rejects an empty text body without calling Graph', async () => {
    const result = await makeClient().sendText({
      token: TOKEN,
      phoneNumberId: '1065403522',
      to: '919876543210',
      body: '   ',
    });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns a Meta error into a safe message without the token', async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          error: {
            message: 'Invalid OAuth access token',
            code: 190,
            error_data: { details: 'Session has expired' },
          },
        },
        401,
      ),
    );
    const client = makeClient();
    const result = await client.getPhoneNumber({
      token: TOKEN,
      phoneNumberId: '1065403522',
    });
    expect(result).toEqual({
      ok: false,
      status: 401,
      message: 'Invalid OAuth access token - Session has expired (code 190)',
    });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it('never throws on network errors or redirects', async () => {
    const client = makeClient();
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(
      client.getPhoneNumber({ token: TOKEN, phoneNumberId: '123456' }),
    ).resolves.toMatchObject({ ok: false, status: 0 });

    fetchMock.mockResolvedValueOnce(
      new Response('', { status: 302, headers: { location: 'https://evil' } }),
    );
    await expect(
      client.getPhoneNumber({ token: TOKEN, phoneNumberId: '123456' }),
    ).resolves.toMatchObject({ ok: false, status: 302 });
  });

  it('refuses to call Meta without a token', async () => {
    const result = await makeClient().listTemplates({ token: '  ', wabaId: '1' });
    expect(result).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
