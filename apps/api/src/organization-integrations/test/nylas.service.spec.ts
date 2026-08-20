import { NylasService, nylasErrorMessage } from '../nylas.service';
import type { NylasCredentials } from '../nylas.service';

describe('nylasErrorMessage', () => {
  it('reads nested v3 error.message (object error is not [object Object])', () => {
    expect(
      nylasErrorMessage(
        {
          request_id: 'req_1',
          error: {
            type: 'authentication_error',
            message: 'Unauthorized request. Please check your credentials.',
          },
        },
        '{"error":{}}',
        401,
      ),
    ).toBe('Unauthorized request. Please check your credentials.');
  });

  it('falls back to nested error.type when message is missing', () => {
    expect(
      nylasErrorMessage(
        { error: { type: 'invalid_request_error' } },
        '',
        400,
      ),
    ).toBe('invalid_request_error');
  });

  it('accepts a string error field', () => {
    expect(
      nylasErrorMessage({ error: 'grant not found' }, '', 404),
    ).toBe('grant not found');
  });

  it('accepts a top-level string message', () => {
    expect(
      nylasErrorMessage({ message: 'rate limited' }, '', 429),
    ).toBe('rate limited');
  });

  it('uses truncated body text when JSON has no string fields', () => {
    expect(nylasErrorMessage({ error: { code: 1 } }, '  raw oops  ', 500)).toBe(
      'raw oops',
    );
  });

  it('uses HTTP status when body is empty', () => {
    expect(nylasErrorMessage(null, '', 503)).toBe('Nylas HTTP 503');
  });
});

describe('NylasService', () => {
  const creds: NylasCredentials = {
    apiKey: 'nylas-key',
    grantId: 'grant-1',
    calendarId: 'primary',
    apiUri: 'https://api.us.nylas.com',
    email: 'clinic@example.com',
  };

  let fetchMock: jest.SpyInstance;
  let service: NylasService;

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
    service = new NylasService();
    fetchMock = jest.spyOn(global, 'fetch');
    const logger = (
      service as unknown as {
        logger: { warn: (m: string) => void; error: (m: string) => void };
      }
    ).logger;
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('maps listCalendars data on success', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          { id: 'primary', name: 'Primary' },
          { id: 'work', name: 'Work' },
        ],
      }),
    );

    await expect(service.listCalendars(creds)).resolves.toEqual({
      ok: true,
      data: [
        { id: 'primary', name: 'Primary' },
        { id: 'work', name: 'Work' },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.us.nylas.com/v3/grants/grant-1/calendars',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns nested Nylas error.message on listCalendars failure', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          request_id: 'req_1',
          error: {
            type: 'authentication_error',
            message: 'Unauthorized request. Please check your credentials.',
          },
        },
        401,
      ),
    );

    await expect(service.listCalendars(creds)).resolves.toEqual({
      ok: false,
      status: 401,
      message: 'Unauthorized request. Please check your credentials.',
    });
  });

  it('does not stringify object errors as [object Object]', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: { type: 'invalid_request_error', message: 'grant is required' },
        },
        400,
      ),
    );

    const result = await service.listCalendars(creds);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe('grant is required');
    expect(result.message).not.toBe('[object Object]');
  });

  it('falls back to HTTP status when the error body is empty', async () => {
    fetchMock.mockResolvedValue(jsonResponse('', 502));

    await expect(service.listCalendars(creds)).resolves.toEqual({
      ok: false,
      status: 502,
      message: 'Nylas HTTP 502',
    });
  });
});
