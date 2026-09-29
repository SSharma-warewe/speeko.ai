import { ConfigService } from '@nestjs/config';
import { GhlService } from '../ghl.service';

describe('GhlService.listContacts', () => {
  const TOKEN = 'pit-contacts-secret';
  let fetchMock: jest.SpyInstance;

  function makeService(): GhlService {
    const get = jest.fn(() => undefined);
    return new GhlService({ get } as unknown as ConfigService);
  }

  function logs(service: GhlService) {
    const logger = (
      service as unknown as {
        logger: { warn: (m: string) => void; log: (m: string) => void };
      }
    ).logger;
    return {
      warn: jest.spyOn(logger, 'warn').mockImplementation(() => undefined),
      log: jest.spyOn(logger, 'log').mockImplementation(() => undefined),
    };
  }

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
  }

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('requires a token and location without calling GHL', async () => {
    const service = makeService();
    await expect(
      service.listContacts({ token: ' ', locationId: 'loc' }),
    ).resolves.toMatchObject({ ok: false, error: 'missing_creds' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps contacts and sends locationId, limit, query with the PIT', async () => {
    fetchMock.mockResolvedValue(
      json({
        contacts: [
          {
            id: 'c1',
            contactName: 'Ada Lovelace',
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@acme.com',
            phone: '+15550100',
            companyName: 'Acme',
            dnd: true,
          },
          { id: 'c2', firstName: 'Bob', lastName: '' },
          { firstName: 'no id — dropped' },
        ],
        meta: { total: 2 },
      }),
    );
    const service = makeService();
    logs(service);

    const result = await service.listContacts({
      token: ` ${TOKEN} `,
      locationId: ' loc_1 ',
      query: '  ada  ',
      limit: 25,
    });

    expect(result).toEqual({
      ok: true,
      total: 2,
      nextCursor: null,
      contacts: [
        {
          id: 'c1',
          name: 'Ada Lovelace',
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@acme.com',
          phone: '+15550100',
          company: 'Acme',
          dnd: true,
        },
        {
          id: 'c2',
          name: 'Bob',
          firstName: 'Bob',
          lastName: '',
          email: null,
          phone: null,
          company: null,
          dnd: false,
        },
      ],
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/contacts/');
    expect(parsed.searchParams.get('locationId')).toBe('loc_1');
    expect(parsed.searchParams.get('limit')).toBe('25');
    expect(parsed.searchParams.get('query')).toBe('ada');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it('clamps the limit to 1..100', async () => {
    fetchMock.mockResolvedValue(json({ contacts: [] }));
    const service = makeService();
    logs(service);
    await service.listContacts({ token: TOKEN, locationId: 'l', limit: 5000 });
    await service.listContacts({ token: TOKEN, locationId: 'l', limit: 0 });
    const limits = fetchMock.mock.calls.map((c) =>
      new URL(c[0] as string).searchParams.get('limit'),
    );
    expect(limits).toEqual(['100', '1']);
  });

  it('paginates with an opaque cursor round trip', async () => {
    const service = makeService();
    logs(service);
    fetchMock.mockResolvedValueOnce(
      json({
        contacts: [{ id: 'a' }, { id: 'b' }],
        meta: { startAfterId: 'b', startAfter: 1700000000000, total: 9 },
      }),
    );
    const first = await service.listContacts({
      token: TOKEN,
      locationId: 'l',
      limit: 2,
    });
    expect(first.ok && first.nextCursor).toBeTruthy();

    fetchMock.mockResolvedValueOnce(json({ contacts: [{ id: 'c' }] }));
    await service.listContacts({
      token: TOKEN,
      locationId: 'l',
      limit: 2,
      cursor: first.ok ? (first.nextCursor ?? undefined) : undefined,
    });
    const next = new URL(fetchMock.mock.calls[1][0] as string).searchParams;
    expect(next.get('startAfterId')).toBe('b');
    expect(next.get('startAfter')).toBe('1700000000000');
  });

  it('has no next cursor on a short page', async () => {
    fetchMock.mockResolvedValue(
      json({
        contacts: [{ id: 'a' }],
        meta: { startAfterId: 'a', startAfter: 1 },
      }),
    );
    const service = makeService();
    logs(service);
    const result = await service.listContacts({
      token: TOKEN,
      locationId: 'l',
      limit: 25,
    });
    expect(result).toMatchObject({ ok: true, nextCursor: null });
  });

  it('ignores a garbage cursor instead of throwing', async () => {
    fetchMock.mockResolvedValue(json({ contacts: [] }));
    const service = makeService();
    logs(service);
    await expect(
      service.listContacts({ token: TOKEN, locationId: 'l', cursor: '%%%' }),
    ).resolves.toMatchObject({ ok: true });
    const params = new URL(fetchMock.mock.calls[0][0] as string).searchParams;
    expect(params.has('startAfterId')).toBe(false);
  });

  it.each([
    [401, /contacts\.readonly/],
    [403, /contacts\.readonly/],
    [400, /location/i],
  ])('maps HTTP %i to a helpful message', async (status, message) => {
    fetchMock.mockResolvedValue(json({ message: 'nope' }, status));
    const service = makeService();
    logs(service);
    const result = await service.listContacts({ token: TOKEN, locationId: 'l' });
    expect(result).toMatchObject({ ok: false, error: `ghl_contacts_${status}` });
    expect(result.ok ? '' : result.message).toMatch(message);
  });

  it('never throws on network errors and never logs the token', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const service = makeService();
    const { warn, log } = logs(service);
    const result = await service.listContacts({ token: TOKEN, locationId: 'l' });
    expect(result).toMatchObject({ ok: false, error: 'network_error' });

    fetchMock.mockResolvedValue(json({ message: 'Unauthorized' }, 401));
    await service.listContacts({ token: TOKEN, locationId: 'l' });

    const joined = [...warn.mock.calls, ...log.mock.calls]
      .map((c) => String(c[0]))
      .join('\n');
    expect(joined).not.toContain(TOKEN);
    expect(joined).not.toMatch(/Bearer /i);
  });
});
