import {
  isAbortError,
  iterateOpenRouterPcm,
  synthesizeOpenRouterPcm,
} from '../tts/openrouter-tts';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as Response;
}

describe('OpenRouter TTS request', () => {
  it('POSTs model, voice, pcm format, and Authorization', async () => {
    const fetchImpl = jest.fn(async () => {
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4),
      } as Response;
    });

    await synthesizeOpenRouterPcm({
      apiKey: 'sk-or-test',
      model: 'google/gemini-3.1-flash-tts-preview',
      voice: 'Kore',
      input: 'Hello there.',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/audio/speech');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer sk-or-test',
      'Content-Type': 'application/json',
      Accept: 'audio/pcm',
    });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      model: 'google/gemini-3.1-flash-tts-preview',
      input: 'Hello there.',
      voice: 'Kore',
      response_format: 'pcm',
    });
  });

  it('yields PCM as the HTTP body streams instead of waiting for arrayBuffer', async () => {
    let arrayBufferCalls = 0;
    const fetchImpl = jest.fn(async () => {
      return {
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 0]));
            controller.enqueue(new Uint8Array([2, 0, 3, 0]));
            controller.close();
          },
        }),
        arrayBuffer: async () => {
          arrayBufferCalls += 1;
          return new ArrayBuffer(0);
        },
      } as Response;
    });

    const chunks: number[] = [];
    for await (const chunk of iterateOpenRouterPcm({
      apiKey: 'sk-or-test',
      model: 'google/gemini-3.1-flash-tts-preview',
      voice: 'Kore',
      input: 'Hello.',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })) {
      chunks.push(...chunk);
    }

    expect(chunks).toEqual([1, 0, 2, 0, 3, 0]);
    expect(arrayBufferCalls).toBe(0);
  });

  it('does not throw a retryable error when the request is aborted', async () => {
    const abortError = new DOMException('This operation was aborted', 'AbortError');
    const fetchImpl = jest.fn(async () => {
      throw abortError;
    });

    const pcm = await synthesizeOpenRouterPcm({
      apiKey: 'sk-or-test',
      model: 'google/gemini-3.1-flash-tts-preview',
      voice: 'Kore',
      input: 'Hello.',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(pcm.byteLength).toBe(0);
  });

  it('returns empty audio when the abort signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = jest.fn();

    const pcm = await synthesizeOpenRouterPcm({
      apiKey: 'sk-or-test',
      model: 'google/gemini-3.1-flash-tts-preview',
      voice: 'Kore',
      input: 'Hello.',
      abortSignal: controller.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(pcm.byteLength).toBe(0);
  });

  it('still surfaces retryable HTTP failures', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(503, { error: 'busy' }));

    await expect(
      synthesizeOpenRouterPcm({
        apiKey: 'sk-or-test',
        model: 'google/gemini-3.1-flash-tts-preview',
        voice: 'Kore',
        input: 'Hello.',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      name: 'APIStatusError',
      retryable: true,
    });
  });

  it('detects AbortError', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('network'))).toBe(false);
  });
});
