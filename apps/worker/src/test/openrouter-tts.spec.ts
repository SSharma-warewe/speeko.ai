import { synthesizeOpenRouterPcm } from '../tts/openrouter-tts';

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
    });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      model: 'google/gemini-3.1-flash-tts-preview',
      input: 'Hello there.',
      voice: 'Kore',
      response_format: 'pcm',
    });
  });
});
