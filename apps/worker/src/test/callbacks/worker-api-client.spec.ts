import {
  DEFAULT_COMPLETE_CALLBACK_MAX_ATTEMPTS,
  WorkerApiClient,
} from '../../callbacks/worker-api-client';

describe('WorkerApiClient.postJson', () => {
  const PATH = '/api/internal/calls/call-1/complete';
  const payload = { status: 'completed' };
  const env = {
    API_BASE_URL: 'http://api.example',
    WORKER_CALLBACK_SECRET: 'secret',
  };

  function jsonResponse(status: number, body = ''): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: jest.fn().mockResolvedValue(body),
    } as unknown as Response;
  }

  function abortedSignal(): AbortSignal {
    const controller = new AbortController();
    controller.abort();
    return controller.signal;
  }

  function client(deps: ConstructorParameters<typeof WorkerApiClient>[0]) {
    return new WorkerApiClient(deps);
  }

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POSTs once on 200', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200));
    const sleep = jest.fn().mockResolvedValue(undefined);

    await client({ fetch: fetchMock, sleep, env }).postJson(
      PATH,
      payload,
      'call complete',
      'callId=call-1 status=completed',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.example/api/internal/calls/call-1/complete',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Worker-Secret': 'secret',
        },
        body: JSON.stringify(payload),
      }),
    );
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries 500 then succeeds', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, 'boom'))
      .mockResolvedValueOnce(jsonResponse(200));
    const sleep = jest.fn().mockResolvedValue(undefined);

    await client({ fetch: fetchMock, sleep, env }).postJson(
      PATH,
      payload,
      'call complete',
      'callId=call-1',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify(payload));
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify(payload));
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('retries network error then succeeds', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse(200));
    const sleep = jest.fn().mockResolvedValue(undefined);

    await client({ fetch: fetchMock, sleep, env }).postJson(
      PATH,
      payload,
      'call complete',
      'callId=call-1',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('aborts a hung fetch via signal then succeeds', async () => {
    const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
      if (fetchMock.mock.calls.length === 1) {
        const signal = init?.signal;
        if (signal?.aborted) {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          throw err;
        }
        return new Promise<Response>(() => undefined);
      }
      return jsonResponse(200);
    });
    const sleep = jest.fn().mockResolvedValue(undefined);

    await client({
      fetch: fetchMock,
      sleep,
      env,
      abortSignal: () => abortedSignal(),
    }).postJson(PATH, payload, 'call complete', 'callId=call-1');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 404])('does not retry HTTP %s', async (status) => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(status, 'nope'));
    const sleep = jest.fn().mockResolvedValue(undefined);

    await client({ fetch: fetchMock, sleep, env }).postJson(
      PATH,
      payload,
      'call complete',
      'callId=call-1',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries 429', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, 'slow down'))
      .mockResolvedValueOnce(jsonResponse(200));
    const sleep = jest.fn().mockResolvedValue(undefined);

    await client({ fetch: fetchMock, sleep, env }).postJson(
      PATH,
      payload,
      'call complete',
      'callId=call-1',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries without throwing', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new TypeError('ECONNRESET'));
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(
      client({ fetch: fetchMock, sleep, env }).postJson(
        PATH,
        payload,
        'call complete',
        'callId=call-1',
      ),
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(DEFAULT_COMPLETE_CALLBACK_MAX_ATTEMPTS);
    expect(sleep).toHaveBeenCalledTimes(
      DEFAULT_COMPLETE_CALLBACK_MAX_ATTEMPTS - 1,
    );
  });

  it('honors COMPLETE_CALLBACK_MAX_ATTEMPTS', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(503));
    const sleep = jest.fn().mockResolvedValue(undefined);

    await client({
      fetch: fetchMock,
      sleep,
      env: { ...env, COMPLETE_CALLBACK_MAX_ATTEMPTS: '3' },
    }).postJson(PATH, payload, 'call complete', 'callId=call-1');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('skips fetch when env is missing', async () => {
    const fetchMock = jest.fn();

    await client({ fetch: fetchMock, env: {} }).postJson(
      PATH,
      payload,
      'call complete',
      'callId=call-1',
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('strips trailing slash on API_BASE_URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200));

    await client({
      fetch: fetchMock,
      env: { ...env, API_BASE_URL: 'http://api.example/' },
    }).postJson(PATH, payload, 'call complete', 'callId=call-1');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://api.example/api/internal/calls/call-1/complete',
    );
  });
});
