import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GhlService } from '../../ghl/ghl.service';
import { DemoService } from '../demo.service';
import { RequestDemoDto } from '../dto/request-demo.dto';

describe('DemoService', () => {
  const endpointUrl = 'https://api.example/integrations/pub/calls';
  const apiKey = 'ca_live_test';

  const baseDto: RequestDemoDto = {
    firstName: '  Alex  ',
    lastName: '  Morgan  ',
    company: '  Acme Health  ',
    email: '  Alex@Acme.Health  ',
    phone: '  +15550102000  ',
    country: '  United States  ',
    teamSize: '  11–50  ',
    callsPerDay: '  50–200  ',
    direction: 'outbound',
    integrations: [' HubSpot ', '', '  Google Calendar  ', '   '],
  };

  const expectedLead = {
    firstName: 'Alex',
    lastName: 'Morgan',
    email: 'alex@acme.health',
    phone: '+15550102000',
    company: 'Acme Health',
    country: 'United States',
    teamSize: '11–50',
    callsPerDay: '50–200',
    direction: 'outbound',
    integrations: ['HubSpot', 'Google Calendar'],
  };

  let configGet: jest.Mock;
  let ghlUpsert: jest.Mock;
  let service: DemoService;
  let fetchMock: jest.SpyInstance;

  function makeService(
    env: { ENDPOINT_URL?: string | undefined; SPEEKO_API?: string | undefined } = {
      ENDPOINT_URL: endpointUrl,
      SPEEKO_API: apiKey,
    },
    ghlResult: { ok: boolean } = { ok: true },
  ): DemoService {
    configGet = jest.fn((key: string) => {
      if (key === 'ENDPOINT_URL') return env.ENDPOINT_URL;
      if (key === 'SPEEKO_API') return env.SPEEKO_API;
      return undefined;
    });
    ghlUpsert = jest.fn().mockResolvedValue(ghlResult);
    return new DemoService(
      { get: configGet } as unknown as ConfigService,
      { upsertLead: ghlUpsert } as unknown as GhlService,
    );
  }

  function jsonResponse(
    body: unknown,
    status = 200,
  ): Response {
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
    service = makeService();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('config gate', () => {
    it('1. throws 503 when ENDPOINT_URL is missing', async () => {
      service = makeService({ ENDPOINT_URL: undefined, SPEEKO_API: apiKey });

      await expect(service.requestDemo(baseDto)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(service.requestDemo(baseDto)).rejects.toThrow(
        /not configured/i,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('2. throws 503 when SPEEKO_API is missing', async () => {
      service = makeService({ ENDPOINT_URL: endpointUrl, SPEEKO_API: undefined });

      await expect(service.requestDemo(baseDto)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('3. throws 503 when values are whitespace-only', async () => {
      service = makeService({ ENDPOINT_URL: '   ', SPEEKO_API: '  ' });

      await expect(service.requestDemo(baseDto)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('4. proceeds to fetch when both env values are set', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ callId: 'call-1' }));

      await expect(service.requestDemo(baseDto)).resolves.toEqual({
        ok: true,
        callId: 'call-1',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('4b. still upserts the GHL lead when dial env is missing', async () => {
      service = makeService({ ENDPOINT_URL: undefined, SPEEKO_API: apiKey });

      await expect(service.requestDemo(baseDto)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(ghlUpsert).toHaveBeenCalledWith(expectedLead);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('GHL lead capture', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValue(jsonResponse({ callId: 'call-1' }));
    });

    it('upserts the normalized lead before enqueue', async () => {
      await service.requestDemo(baseDto);

      expect(ghlUpsert).toHaveBeenCalledWith(expectedLead);
      expect(ghlUpsert.mock.invocationCallOrder[0]).toBeLessThan(
        fetchMock.mock.invocationCallOrder[0],
      );
    });

    it('still enqueues when GHL returns ok:false', async () => {
      service = makeService(undefined, { ok: false });

      await expect(service.requestDemo(baseDto)).resolves.toEqual({
        ok: true,
        callId: 'call-1',
      });
      expect(ghlUpsert).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('request shaping', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValue(jsonResponse({ callId: 'call-1' }));
    });

    it('5. POSTs to the configured ENDPOINT_URL (trimmed)', async () => {
      service = makeService({
        ENDPOINT_URL: `  ${endpointUrl}  `,
        SPEEKO_API: apiKey,
      });

      await service.requestDemo(baseDto);

      expect(fetchMock).toHaveBeenCalledWith(
        endpointUrl,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('6. sends Content-Type and Bearer Authorization headers', async () => {
      await service.requestDemo(baseDto);

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers.Authorization).toBe(`Bearer ${apiKey}`);
    });

    it('7. builds normalized integration body from form fields', async () => {
      await service.requestDemo(baseDto);

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(String(init.body)) as {
        phoneNumber: string;
        externalId: string;
        context: Record<string, unknown>;
      };

      expect(body.phoneNumber).toBe('+15550102000');
      expect(body.externalId).toBe('get-demo:alex@acme.health');
      expect(body.context).toEqual({
        source: 'get_demo',
        firstName: 'Alex',
        lastName: 'Morgan',
        company: 'Acme Health',
        email: 'alex@acme.health',
        country: 'United States',
        teamSize: '11–50',
        callsPerDay: '50–200',
        direction: 'outbound',
        integrations: ['HubSpot', 'Google Calendar'],
      });
    });
  });

  describe('happy path', () => {
    it('8. returns ok + callId when integration returns a string callId', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ callId: 'uuid-abc', status: 'pending' }),
      );

      await expect(service.requestDemo(baseDto)).resolves.toEqual({
        ok: true,
        callId: 'uuid-abc',
      });
    });

    it('9. returns ok without callId when response omits callId', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ status: 'pending' }));

      await expect(service.requestDemo(baseDto)).resolves.toEqual({ ok: true });
    });

    it('10. ignores non-string callId', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ callId: 12345 }));

      await expect(service.requestDemo(baseDto)).resolves.toEqual({ ok: true });
    });

    it('11. returns ok when body is empty or non-JSON', async () => {
      fetchMock.mockResolvedValue(jsonResponse(''));
      await expect(service.requestDemo(baseDto)).resolves.toEqual({ ok: true });

      fetchMock.mockResolvedValue(jsonResponse('not-json{'));
      await expect(service.requestDemo(baseDto)).resolves.toEqual({ ok: true });
    });
  });

  describe('failure mapping', () => {
    it('12. maps network errors to 502', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.requestDemo(baseDto)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
      await expect(service.requestDemo(baseDto)).rejects.toThrow(
        /Could not start your demo call/i,
      );
    });

    it('13. maps 401/403 to misconfigured 502', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401));
      await expect(service.requestDemo(baseDto)).rejects.toThrow(
        /Demo dial is misconfigured/i,
      );

      fetchMock.mockResolvedValue(jsonResponse({ error: 'forbidden' }, 403));
      await expect(service.requestDemo(baseDto)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
      await expect(service.requestDemo(baseDto)).rejects.toThrow(
        /Demo dial is misconfigured/i,
      );
    });

    it('14. maps other non-OK statuses to generic 502', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, 500));

      await expect(service.requestDemo(baseDto)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
      await expect(service.requestDemo(baseDto)).rejects.toThrow(
        /Could not start your demo call/i,
      );
    });

    it('15. tolerates response.text() failure on non-OK status', async () => {
      const response = {
        ok: false,
        status: 502,
        text: jest.fn().mockRejectedValue(new Error('stream failed')),
      } as unknown as Response;
      fetchMock.mockResolvedValue(response);

      await expect(service.requestDemo(baseDto)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
      await expect(service.requestDemo(baseDto)).rejects.toThrow(
        /Could not start your demo call/i,
      );
    });
  });
});
