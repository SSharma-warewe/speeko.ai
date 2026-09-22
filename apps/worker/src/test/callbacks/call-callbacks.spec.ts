import { CallbackFunctions, type CompleteCallPayload } from '../../callbacks/call-callbacks';
import {
  DEFAULT_COMPLETE_CALLBACK_MAX_ATTEMPTS,
  WorkerApiClient,
} from '../../callbacks/worker-api-client';

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

  function callbacks(deps: ConstructorParameters<typeof WorkerApiClient>[0]) {
    return new CallbackFunctions(new WorkerApiClient(deps));
  }

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POSTs complete on the call path', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200));

    await callbacks({ fetch: fetchMock, env }).postCallComplete(CALL_ID, payload);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.example/api/internal/calls/call-1/complete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      }),
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

  function callbacks(deps: ConstructorParameters<typeof WorkerApiClient>[0]) {
    return new CallbackFunctions(new WorkerApiClient(deps));
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
      callbacks({ fetch: fetchMock, env }).postInboundEnsure(ensurePayload),
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
      callbacks({ fetch: fetchMock, sleep, env }).postInboundEnsure(ensurePayload),
    ).resolves.toBe('call-in-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns undefined after exhaustion without throwing', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new TypeError('ECONNRESET'));
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(
      callbacks({ fetch: fetchMock, sleep, env }).postInboundEnsure(ensurePayload),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(DEFAULT_COMPLETE_CALLBACK_MAX_ATTEMPTS);
  });
});

describe('postInboundJobMetadata', () => {
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

  function callbacks(deps: ConstructorParameters<typeof WorkerApiClient>[0]) {
    return new CallbackFunctions(new WorkerApiClient(deps));
  }

  it('parses live realtime model from the packed body', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(
        200,
        JSON.stringify({
          organizationId: 'org-1',
          organizationAgentId: 'oa-1',
          agentKey: 'inbound',
          direction: 'inbound',
          medium: 'sip',
          task: 'general',
          prompt: { systemPrompt: 'Hi' },
          enabledTools: ['endCall'],
          model: 'openai/gpt-realtime-2.1-mini',
          ttsModel: null,
          voice: 'marin',
        }),
      ),
    );

    const meta = await callbacks({ fetch: fetchMock, env }).postInboundJobMetadata({
      organizationId: 'org-1',
      organizationAgentId: 'oa-1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.example/api/internal/organization-agents/oa-1/job-metadata',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ organizationId: 'org-1' }),
      }),
    );
    expect(meta?.model).toBe('openai/gpt-realtime-2.1-mini');
    expect(meta?.ttsModel).toBeNull();
    expect(meta?.voice).toBe('marin');
  });

  it('returns undefined after a 500 without throwing', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(500, 'boom'));
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(
      callbacks({ fetch: fetchMock, sleep, env }).postInboundJobMetadata({
        organizationId: 'org-1',
        organizationAgentId: 'oa-1',
      }),
    ).resolves.toBeUndefined();
  });
});
