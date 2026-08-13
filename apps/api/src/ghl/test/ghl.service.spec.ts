import { ConfigService } from '@nestjs/config';
import { GhlService } from '../ghl.service';
import type { GhlLeadInput } from '../ghl.types';

describe('GhlService', () => {
  const apiKey = 'pit-test-key';
  const locationId = 'loc_test_1';

  const baseLead: GhlLeadInput = {
    firstName: '  Alex  ',
    lastName: '  Morgan  ',
    email: '  Alex@Acme.Health  ',
    phone: '  +15550102000  ',
    company: '  Acme Health  ',
    country: '  United States  ',
    teamSize: '  11–50  ',
    callsPerDay: '  50–200  ',
    direction: 'outbound',
    integrations: [' HubSpot ', '', '  Google Calendar  '],
  };

  let fetchMock: jest.SpyInstance;

  function makeService(
    env: { GHL_API_KEY?: string; GHL_LOCATION_ID?: string } = {
      GHL_API_KEY: apiKey,
      GHL_LOCATION_ID: locationId,
    },
  ): GhlService {
    const get = jest.fn((key: string) => {
      if (key === 'GHL_API_KEY') return env.GHL_API_KEY;
      if (key === 'GHL_LOCATION_ID') return env.GHL_LOCATION_ID;
      return undefined;
    });
    return new GhlService({ get } as unknown as ConfigService);
  }

  function serviceLogger(service: GhlService): {
    warn: jest.SpyInstance;
    log: jest.SpyInstance;
  } {
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

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(
      body === undefined || body === ''
        ? ''
        : typeof body === 'string'
          ? body
          : JSON.stringify(body),
      { status },
    );
  }

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('config gate', () => {
    it('skips when GHL_API_KEY is missing', async () => {
      const service = makeService({
        GHL_API_KEY: undefined,
        GHL_LOCATION_ID: locationId,
      });

      await expect(service.upsertLead(baseLead)).resolves.toEqual({
        ok: false,
        skipped: true,
        error: 'ghl disabled',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('skips when GHL_LOCATION_ID is missing', async () => {
      const service = makeService({
        GHL_API_KEY: apiKey,
        GHL_LOCATION_ID: '   ',
      });

      await expect(service.upsertLead(baseLead)).resolves.toEqual({
        ok: false,
        skipped: true,
        error: 'ghl disabled',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('upsert', () => {
    beforeEach(() => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/contacts/upsert')) {
          return jsonResponse({
            new: true,
            contact: { id: 'ct_1', email: 'alex@acme.health' },
          });
        }
        if (url.includes('/tags')) return jsonResponse({ tags: [] }, 201);
        if (url.includes('/notes')) return jsonResponse({ note: { id: 'n1' } }, 201);
        return jsonResponse({ error: 'unexpected' }, 500);
      });
    });

    it('POSTs upsert with Bearer + Version and mapped body (no tags)', async () => {
      const service = makeService();

      await expect(service.upsertLead(baseLead)).resolves.toEqual({
        ok: true,
        contactId: 'ct_1',
        created: true,
      });

      expect(fetchMock).toHaveBeenCalledTimes(3);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://services.leadconnectorhq.com/contacts/upsert');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${apiKey}`);
      expect(headers.Version).toBe('2021-07-28');
      expect(headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(body).toEqual({
        locationId,
        source: 'Speeko Get Demo',
        firstName: 'Alex',
        lastName: 'Morgan',
        email: 'alex@acme.health',
        phone: '+15550102000',
        companyName: 'Acme Health',
        country: 'US',
      });
      expect(body).not.toHaveProperty('tags');
    });

    it('adds tags and a qualification note after upsert', async () => {
      const service = makeService();
      await service.upsertLead(baseLead);

      const tagCall = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(tagCall[0]).toBe(
        'https://services.leadconnectorhq.com/contacts/ct_1/tags',
      );
      expect(JSON.parse(String(tagCall[1].body))).toEqual({
        tags: ['speeko-get-demo', 'direction:outbound'],
      });

      const noteCall = fetchMock.mock.calls[2] as [string, RequestInit];
      expect(noteCall[0]).toBe(
        'https://services.leadconnectorhq.com/contacts/ct_1/notes',
      );
      expect(JSON.parse(String(noteCall[1].body))).toEqual({
        body: [
          'Team size: 11–50',
          'Calls per day: 50–200',
          'Direction: outbound',
          'Integrations: HubSpot, Google Calendar',
        ].join('\n'),
      });
    });

    it('omits country when label is Other', async () => {
      const service = makeService();
      await service.upsertLead({ ...baseLead, country: 'Other' });

      const body = JSON.parse(
        String((fetchMock.mock.calls[0][1] as RequestInit).body),
      ) as Record<string, unknown>;
      expect(body).not.toHaveProperty('country');
    });

    it('still returns ok when tag/note follow-ups fail', async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/contacts/upsert')) {
          return jsonResponse({ new: false, contact: { id: 'ct_2' } });
        }
        return jsonResponse({ error: 'nope' }, 422);
      });

      const service = makeService();
      await expect(service.upsertLead(baseLead)).resolves.toEqual({
        ok: true,
        contactId: 'ct_2',
        created: false,
      });
    });
  });

  describe('failures never throw', () => {
    it('maps network errors to ok:false', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
      const service = makeService();

      await expect(service.upsertLead(baseLead)).resolves.toEqual({
        ok: false,
        error: 'ECONNREFUSED',
      });
    });

    it('maps non-OK upsert to ok:false', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, 401));
      const service = makeService();

      await expect(service.upsertLead(baseLead)).resolves.toEqual({
        ok: false,
        error: 'ghl upsert 401',
      });
    });

    it('maps missing contact.id to ok:false', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ new: true, contact: {} }));
      const service = makeService();

      await expect(service.upsertLead(baseLead)).resolves.toEqual({
        ok: false,
        error: 'ghl upsert missing contact.id',
      });
    });

    it('does not include the API key in logged strings', async () => {
      const service = makeService();
      const { warn } = serviceLogger(service);
      fetchMock.mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, 401));

      await service.upsertLead(baseLead);

      const joined = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(joined).toMatch(/GHL upsert failed: status=401/);
      expect(joined).not.toContain(apiKey);
      expect(joined).not.toMatch(/Bearer /i);
    });
  });
});
