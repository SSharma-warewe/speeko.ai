import {
  DEFAULT_COMPLETE_CALLBACK_MAX_ATTEMPTS,
  isRetryableCompleteStatus,
  postCallComplete,
  postInboundEnsure,
  type CompleteCallPayload,
} from '../call-callback';

describe('isRetryableCompleteStatus', () => {
  it.each([
    [408, true],
    [429, true],
    [500, true],
    [502, true],
    [503, true],
    [200, false],
    [400, false],
    [401, false],
    [403, false],
    [404, false],
    [409, false],
  ])('status %s → %s', (status, expected) => {
    expect(isRetryableCompleteStatus(status)).toBe(expected);
  });
});

describe('postCallComplete', () => {
  const CALL_ID = 'call-1';
  const payload: CompleteCallPayload = {
    status: 'completed',
    taskCompleted: true,
  };

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

    await postCallComplete(CALL_ID, payload, { fetch: fetchMock, sleep, env });

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

    await postCallComplete(CALL_ID, payload, { fetch: fetchMock, sleep, env });

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

    await postCallComplete(CALL_ID, payload, { fetch: fetchMock, sleep, env });

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

    await postCallComplete(CALL_ID, payload, {
      fetch: fetchMock,
      sleep,
      env,
      abortSignal: () => abortedSignal(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 404])('does not retry HTTP %s', async (status) => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(status, 'nope'));
    const sleep = jest.fn().mockResolvedValue(undefined);

    await postCallComplete(CALL_ID, payload, { fetch: fetchMock, sleep, env });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries 429', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, 'slow down'))
      .mockResolvedValueOnce(jsonResponse(200));
    const sleep = jest.fn().mockResolvedValue(undefined);

    await postCallComplete(CALL_ID, payload, { fetch: fetchMock, sleep, env });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries without throwing', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new TypeError('ECONNRESET'));
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(
      postCallComplete(CALL_ID, payload, { fetch: fetchMock, sleep, env }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(DEFAULT_COMPLETE_CALLBACK_MAX_ATTEMPTS);
    expect(sleep).toHaveBeenCalledTimes(
      DEFAULT_COMPLETE_CALLBACK_MAX_ATTEMPTS - 1,
    );
  });

  it('honors COMPLETE_CALLBACK_MAX_ATTEMPTS', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(503));
    const sleep = jest.fn().mockResolvedValue(undefined);

    await postCallComplete(CALL_ID, payload, {
      fetch: fetchMock,
      sleep,
      env: { ...env, COMPLETE_CALLBACK_MAX_ATTEMPTS: '3' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('skips fetch when env is missing', async () => {
    const fetchMock = jest.fn();

    await postCallComplete(CALL_ID, payload, {
      fetch: fetchMock,
      env: {},
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('strips trailing slash on API_BASE_URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200));

    await postCallComplete(CALL_ID, payload, {
      fetch: fetchMock,
      env: { ...env, API_BASE_URL: 'http://api.example/' },
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://api.example/api/internal/calls/call-1/complete',
    );
  });
});

describe('postInboundEnsure', () => {
  const ensurePayload = {
    roomName: 'call-+1555_x',
    organizationId: 'org-1',
    agentKey: 'inbound',
  };

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

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns id from JSON body', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, JSON.stringify({ id: 'call-in-1' })));

    await expect(
      postInboundEnsure(ensurePayload, { fetch: fetchMock, env }),
    ).resolves.toBe('call-in-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.example/api/internal/calls/inbound',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(ensurePayload),
      }),
    );
  });

  it('retries 500 then returns id', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, 'boom'))
      .mockResolvedValueOnce(
        jsonResponse(200, JSON.stringify({ id: 'call-in-2' })),
      );
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(
      postInboundEnsure(ensurePayload, { fetch: fetchMock, sleep, env }),
    ).resolves.toBe('call-in-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns undefined after exhaustion without throwing', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new TypeError('ECONNRESET'));
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(
      postInboundEnsure(ensurePayload, { fetch: fetchMock, sleep, env }),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(DEFAULT_COMPLETE_CALLBACK_MAX_ATTEMPTS);
  });
});
