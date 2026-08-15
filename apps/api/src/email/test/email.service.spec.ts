import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email.service';

describe('EmailService', () => {
  const apiKey = 'plunk-test-key';
  let fetchMock: jest.SpyInstance;

  function makeService(
    env: Record<string, string | undefined> = {
      PLUNK_API_KEY: apiKey,
      EMAIL_FROM: 'Speeko <hello@speeko.ai>',
    },
  ): EmailService {
    const get = jest.fn((key: string) => env[key]);
    return new EmailService({ get } as unknown as ConfigService);
  }

  function serviceLogger(service: EmailService): {
    warn: jest.SpyInstance;
    log: jest.SpyInstance;
  } {
    return {
      warn: jest.spyOn(
        (service as unknown as { logger: { warn: (m: string) => void } })
          .logger,
        'warn',
      ),
      log: jest.spyOn(
        (service as unknown as { logger: { log: (m: string) => void } }).logger,
        'log',
      ),
    };
  }

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { emails: [{ email: 'em_123' }] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('no-ops when PLUNK_API_KEY is missing', async () => {
    const service = makeService({ PLUNK_API_KEY: '' });
    const { warn } = serviceLogger(service);

    const result = await service.send({
      to: 'user@acme.com',
      subject: 'Hello',
      text: 'Hi',
    });

    expect(result).toEqual({
      ok: false,
      skipped: true,
      error: 'email disabled',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(service.isEnabled()).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('sends HTML via Plunk and returns the email id', async () => {
    const service = makeService();

    const result = await service.send({
      to: 'user@acme.com',
      subject: 'Set your password',
      html: '<p>Click</p>',
    });

    expect(result).toEqual({ ok: true, id: 'em_123' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.useplunk.com/v1/send');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${apiKey}`);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      to: 'user@acme.com',
      subject: 'Set your password',
      body: '<p>Click</p>',
      from: { name: 'Speeko', email: 'hello@speeko.ai' },
    });
  });

  it('wraps plain text as HTML', async () => {
    const service = makeService();
    await service.sendText('user@acme.com', 'Hello', 'Line 1\nLine 2');

    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    ) as { body: string };
    expect(body.body).toContain('Line 1');
    expect(body.body).toContain('Line 2');
  });

  it('returns ok:false on 401 and never throws', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: { message: 'Invalid API key', requestId: 'req_1' },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const service = makeService();
    const { warn } = serviceLogger(service);

    await expect(
      service.send({ to: 'a@b.com', subject: 'Hi', text: 'x' }),
    ).resolves.toEqual({ ok: false, error: 'Invalid API key' });
    expect(warn).toHaveBeenCalled();
    const logged = String(warn.mock.calls[0]?.[0] ?? '');
    expect(logged).not.toContain(apiKey);
  });

  it('never logs the API key on network errors', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));
    const service = makeService();
    const { warn } = serviceLogger(service);

    const result = await service.send({
      to: 'a@b.com',
      subject: 'Hi',
      text: 'x',
    });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(apiKey);
  });

  it('rejects missing to / subject / body without calling Plunk', async () => {
    const service = makeService();
    await expect(
      service.send({ to: '', subject: 'Hi', text: 'x' }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      service.send({ to: 'a@b.com', subject: '  ', text: 'x' }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      service.send({ to: 'a@b.com', subject: 'Hi' }),
    ).resolves.toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
