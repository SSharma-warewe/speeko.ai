import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { AudioFrame } from '@livekit/rtc-node';
import type { tts } from '@livekit/agents';
import {
  TTS_CACHE_NAMESPACE,
  type AgentJobMetadata,
} from '@call-agent/contracts';
import { TtsCacheRuntime } from '../../speech/tts-cache-runtime';
import {
  TtsSharedCacheClient,
  type TtsSharedCache,
} from '../../speech/tts-shared-cache-client';
import {
  decodeCacheEntry,
  encodeCacheEntry,
  type TtsCacheEntry,
} from '../../speech/tts-cache-envelope';
import { resolveTtsConfiguration } from '../../builders/model-builder';

const org = '11111111-1111-4111-8111-111111111111',
  otherOrg = '22222222-2222-4222-8222-222222222222';
const call = '33333333-3333-4333-8333-333333333333';
const entry = (samples = 240): TtsCacheEntry => ({
  frames: [
    {
      data: new Int16Array(samples).fill(7),
      sampleRate: 24000,
      channels: 1,
      samplesPerChannel: samples,
      timings: [{ text: 'Fixture', startTime: 0, endTime: samples / 24000 }],
    },
  ],
  bytes: samples * 2 + 400,
  expires: Date.now() + 60000,
});
function fixture(
  shared?: TtsSharedCache,
  extra: Partial<AgentJobMetadata> = {},
) {
  const meta: AgentJobMetadata = {
    organizationId: org,
    callId: call,
    agentKey: 'outbound',
    task: 'general',
    direction: 'outbound',
    enabledTools: ['endCall'],
    prompt: { systemPrompt: 'Fixture' },
    ...extra,
  };
  const provider = Object.assign(new EventEmitter(), {
    sampleRate: 24000,
    numChannels: 1,
    synthesize: jest.fn(),
    stream: jest.fn(),
    close: jest.fn(),
  }) as unknown as tts.TTS;
  return {
    cache: new TtsCacheRuntime(
      meta,
      resolveTtsConfiguration(meta),
      provider,
      {},
      Date.now,
      shared,
    ),
    provider,
  };
}
const live = () =>
  jest.fn(
    () =>
      new ReadableStream<AudioFrame>({
        start(output) {
          output.enqueue(
            new AudioFrame(new Int16Array(240).fill(7), 24000, 1, 240, {
              'lk.timed_transcripts': [
                { text: 'Fixture', startTime: 0, endTime: 0.01 },
              ],
              requestId: 'historical',
            }),
          );
          output.close();
        },
      }),
  );
async function drain(stream: ReadableStream<AudioFrame>) {
  const reader = stream.getReader(),
    frames: AudioFrame[] = [];
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return frames;
      frames.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
}
const open = (cache: TtsCacheRuntime, source = live()) =>
  cache.open('Fixture', 'websocket', 'sdk-plain-segment-v1', source);
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('worker cross-call TTS cache', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('allows slower shared retrieval before dialing and retains it for local opening playback', async () => {
    const shared: TtsSharedCache = {
      lookup: jest.fn(async (_key, deadline) => {
        expect(deadline - performance.now()).toBeGreaterThan(900);
        await new Promise((resolve) => setTimeout(resolve, 40));
        return entry();
      }),
      publish: jest.fn(),
      dispose: jest.fn(),
    };
    const { cache, provider } = fixture(shared);
    try {
      await cache.prepareOpening('Fixture', new AbortController().signal);
      expect((await drain(cache.finiteAudio('Fixture')))[0].data[0]).toBe(7);
      expect(shared.lookup).toHaveBeenCalledTimes(1);
      expect(provider.stream).not.toHaveBeenCalled();
      expect(provider.synthesize).not.toHaveBeenCalled();
    } finally {
      cache.dispose();
    }
  });
  it('a second call reuses original synthesis; changed tenant/settings miss', async () => {
    const stored = new Map<string, unknown>();
    const fetcher = jest.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init!.body as string),
          tenant = String(url).includes('foreign') ? otherOrg : org;
        const key = `${tenant}:${body.digest}`;
        expect(body.namespace).toBe(TTS_CACHE_NAMESPACE);
        expect(body).not.toHaveProperty('organizationId');
        if (String(url).endsWith('publish')) {
          if (!stored.has(key)) stored.set(key, body.envelope);
          return response({ result: 'stored' });
        }
        return response(
          stored.has(key)
            ? {
                hit: true,
                envelope: stored.get(key),
                expiresAt: new Date(Date.now() + 60000).toISOString(),
              }
            : { hit: false },
        );
      },
    ) as jest.MockedFunction<typeof fetch>;
    const client = (id: string) =>
      new TtsSharedCacheClient('http://fixture', 'fixture-secret', id, 'room', {
        fetch: fetcher,
      });
    const first = fixture(client('first')),
      source = live();
    await drain(open(first.cache, source));
    await flush();
    await new Promise<void>((resolve) => setImmediate(resolve));
    await flush();
    expect(source).toHaveBeenCalledTimes(1);
    expect(stored.size).toBe(1);
    const second = fixture(client('second')),
      unnecessary = live();
    const replay = await drain(open(second.cache, unnecessary));
    expect(unnecessary).not.toHaveBeenCalled();
    expect(second.cache.stats.sharedHits).toBe(1);
    expect(replay[0].data[0]).toBe(7);
    expect(replay[0].userdata).not.toHaveProperty('requestId');
    const again = await drain(open(second.cache, unnecessary));
    expect(again[0]).not.toBe(replay[0]);
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).endsWith('lookup')),
    ).toHaveLength(2);
    for (const extra of [
      { organizationId: otherOrg },
      { voice: 'different' },
      { speakingRate: 1.2 },
    ]) {
      const different = fixture(client('foreign'), extra),
        synth = live();
      await drain(open(different.cache, synth));
      expect(synth).toHaveBeenCalledTimes(1);
      different.cache.dispose();
    }
    first.cache.dispose();
    second.cache.dispose();
    expect(first.provider.close).not.toHaveBeenCalled();
  });
  it('round-trips PCM little-endian, ordered frames and only safe alignments', () => {
    const original = entry();
    original.frames[0].data[0] = -32768;
    original.frames[0].data[1] = 32767;
    original.frames.push({
      ...original.frames[0],
      data: new Int16Array(240).fill(123),
      timings: [],
    });
    const encoded = encodeCacheEntry(original),
      decoded = decodeCacheEntry(encoded, original.expires);
    expect([...decoded.frames[0].data.slice(0, 2)]).toEqual([-32768, 32767]);
    expect(decoded.frames[1].data[0]).toBe(123);
    expect(decoded.frames[0].data).not.toBe(original.frames[0].data);
    expect(() =>
      decodeCacheEntry(
        { ...encoded, checksum: 'f'.repeat(64) },
        original.expires,
      ),
    ).toThrow();
    expect(() =>
      decodeCacheEntry(
        { ...encoded, frames: [{ samplesPerChannel: 1, timings: [] }] },
        original.expires,
      ),
    ).toThrow();
  });
  it('a timed-out lookup cannot delay or replace live speech, even if fetch ignores abort', async () => {
    jest.useFakeTimers();
    let resolve!: (r: Response) => void;
    const fetcher = jest.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ) as jest.MockedFunction<typeof fetch>;
    const client = new TtsSharedCacheClient(
      'http://fixture',
      'fixture',
      call,
      'room',
      { fetch: fetcher },
    );
    const { cache } = fixture(client),
      synth = live(),
      result = drain(open(cache, synth));
    await flush();
    expect(synth).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(25);
    expect(synth).toHaveBeenCalledTimes(1);
    const frames = await result;
    expect(frames[0].data[0]).toBe(7);
    resolve(
      response({
        hit: true,
        envelope: encodeCacheEntry(entry()),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      }),
    );
    await flush();
    expect(cache.stats.sharedHits).toBe(0);
    cache.dispose();
    await flush();
    expect(client.pendingBytes).toBe(0);
  });
  it('local fill waiting and shared lookup use one 25 ms budget', async () => {
    jest.useFakeTimers();
    const fetcher = jest.fn(
      () => new Promise<Response>(() => {}),
    ) as jest.MockedFunction<typeof fetch>;
    const client = new TtsSharedCacheClient(
      'http://fixture',
      'fixture',
      call,
      'room',
      { fetch: fetcher },
    );
    const { cache } = fixture(client);
    const firstSource = jest.fn(() => new ReadableStream<AudioFrame>()),
      first = open(cache, firstSource).getReader();
    const waiting = first.read().catch(() => undefined);
    await flush();
    await jest.advanceTimersByTimeAsync(5);
    const secondSource = live(),
      second = drain(open(cache, secondSource));
    await flush();
    await jest.advanceTimersByTimeAsync(24);
    expect(secondSource).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await second;
    expect(secondSource).toHaveBeenCalledTimes(1);
    expect(
      fetcher.mock.calls.filter(([u]) => String(u).endsWith('lookup')),
    ).toHaveLength(1);
    await first.cancel();
    await waiting;
    cache.dispose();
  });
  it.each(['checksum', 'expired', 'format', 'oversized'])(
    'invalid shared %s falls back to one live source',
    async (reason) => {
      const envelope = encodeCacheEntry(entry());
      let expiresAt = new Date(Date.now() + 60000).toISOString();
      if (reason === 'checksum') envelope.checksum = 'f'.repeat(64);
      if (reason === 'expired') expiresAt = new Date(0).toISOString();
      if (reason === 'format') envelope.sampleRate = 48000;
      const fetcher = jest.fn(async () =>
        reason === 'oversized'
          ? new Response('x', { headers: { 'content-length': '2000000' } })
          : response({ hit: true, envelope, expiresAt }),
      ) as jest.MockedFunction<typeof fetch>;
      const client = new TtsSharedCacheClient(
        'http://fixture',
        'fixture',
        call,
        'room',
        { fetch: fetcher },
      );
      const { cache } = fixture(client),
        synth = live();
      await drain(open(cache, synth));
      expect(synth).toHaveBeenCalledTimes(1);
      expect(cache.stats.sharedHits).toBe(0);
      cache.dispose();
    },
  );
  it('aborts a stalled response reader and does not retain input bytes', async () => {
    jest.useFakeTimers();
    const cancel = jest.fn();
    const fetcher = jest.fn(
      async () => new Response(new globalThis.ReadableStream({ cancel })),
    ) as jest.MockedFunction<typeof fetch>;
    const client = new TtsSharedCacheClient(
      'http://fixture',
      'fixture',
      call,
      'room',
      { fetch: fetcher },
    );
    const lookup = client.lookup(
      'a'.repeat(64),
      performance.now() + 25,
      new AbortController().signal,
    );
    await flush();
    await jest.advanceTimersByTimeAsync(25);
    expect(await lookup).toBeUndefined();
    expect(cancel).toHaveBeenCalled();
    client.dispose();
  });
  it('three failures trigger ten-second backoff, then retry without callbacks or provider changes', async () => {
    jest.useFakeTimers();
    const fetcher = jest.fn(async () =>
      response({}, 503),
    ) as jest.MockedFunction<typeof fetch>;
    const client = new TtsSharedCacheClient(
      'http://fixture',
      'fixture',
      call,
      'room',
      { fetch: fetcher },
    );
    const lookup = () =>
      client.lookup(
        'a'.repeat(64),
        performance.now() + 25,
        new AbortController().signal,
      );
    for (let i = 0; i < 3; i++) await lookup();
    await lookup();
    expect(fetcher).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(10000);
    await lookup();
    expect(fetcher).toHaveBeenCalledTimes(4);
    client.dispose();
  });
  it.each([401, 403, 404])(
    'authorization denial %s disables sharing for the job',
    async (status) => {
      const fetcher = jest.fn(async () =>
        response({}, status),
      ) as jest.MockedFunction<typeof fetch>;
      const client = new TtsSharedCacheClient(
        'http://fixture',
        'fixture',
        call,
        'room',
        { fetch: fetcher },
      );
      for (let i = 0; i < 2; i++)
        await client.lookup(
          'a'.repeat(64),
          performance.now() + 25,
          new AbortController().signal,
        );
      client.publish('a'.repeat(64), entry());
      await flush();
      expect(fetcher).toHaveBeenCalledTimes(1);
      client.dispose();
    },
  );
  it('uploads asynchronously with two requests, a four-MiB budget, timeout and no retries', async () => {
    jest.useFakeTimers();
    const fetcher = jest.fn(
      () => new Promise<Response>(() => {}),
    ) as jest.MockedFunction<typeof fetch>;
    const client = new TtsSharedCacheClient(
      'http://fixture',
      'fixture',
      call,
      'room',
      { fetch: fetcher },
    );
    for (let i = 0; i < 20; i++) client.publish('a'.repeat(64), entry(150000));
    expect(fetcher).not.toHaveBeenCalled();
    expect(client.pendingBytes).toBeLessThanOrEqual(4 * 1024 * 1024);
    await jest.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(client.stats.dropped).toBeGreaterThan(0);
    await jest.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(client.stats.timeouts).toBe(2);
    client.dispose();
    await flush();
    expect(client.pendingBytes).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('automatic opt-out does not disable prepared requests in the same bounded client', async () => {
    const fetcher = jest.fn(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      return response(
        body.purpose === 'prepared' ? { hit: false } : {},
        body.purpose === 'prepared' ? 200 : 403,
      );
    }) as jest.MockedFunction<typeof fetch>;
    const client = new TtsSharedCacheClient(
      'http://fixture',
      'fixture',
      call,
      'room',
      { fetch: fetcher },
    );
    const lookup = (purpose: 'automatic' | 'prepared') =>
      client.lookup(
        'a'.repeat(64),
        performance.now() + 25,
        new AbortController().signal,
        purpose,
      );
    await lookup('automatic');
    await lookup('automatic');
    await lookup('prepared');
    expect(fetcher).toHaveBeenCalledTimes(2);
    client.dispose();
  });
  it('dispose aborts lookup immediately and never closes the provider', async () => {
    const fetcher = jest.fn(
      () => new Promise<Response>(() => {}),
    ) as jest.MockedFunction<typeof fetch>;
    const client = new TtsSharedCacheClient(
      'http://fixture',
      'fixture',
      call,
      'room',
      { fetch: fetcher },
    );
    const { cache, provider } = fixture(client);
    const reader = open(cache).getReader(),
      result = reader.read();
    await flush();
    cache.dispose();
    await expect(result).rejects.toThrow('aborted');
    expect((fetcher.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(
      true,
    );
    expect(provider.close).not.toHaveBeenCalled();
  });
  it('never publishes empty, failed, or interrupted captures', async () => {
    const shared = {
      lookup: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn(),
      dispose: jest.fn(),
    };
    for (const kind of ['empty', 'failure', 'interrupted']) {
      const { cache } = fixture(shared);
      const stream = cache.open(
        'Fixture',
        'websocket',
        'sdk-plain-segment-v1',
        () =>
          new ReadableStream<AudioFrame>({
            start(output) {
              if (kind === 'empty') output.close();
              else {
                output.enqueue(new AudioFrame(new Int16Array(2), 24000, 1, 2));
                if (kind === 'failure')
                  output.error(new Error('Provider failed'));
              }
            },
          }),
      );
      if (kind === 'interrupted') {
        const reader = stream.getReader();
        await reader.read();
        await reader.cancel();
      } else if (kind === 'failure')
        await expect(drain(stream)).rejects.toThrow('Provider failed');
      else await drain(stream);
      cache.dispose();
    }
    expect(shared.publish).not.toHaveBeenCalled();
  });
  it('local replay cannot outlive a shared entry expiry', async () => {
    jest.useFakeTimers();
    const audio = entry();
    audio.expires = Date.now() + 100;
    const shared = {
      lookup: jest.fn().mockResolvedValue(audio),
      publish: jest.fn(),
      dispose: jest.fn(),
    };
    const { cache } = fixture(shared),
      synth = live();
    await drain(open(cache, synth));
    expect(synth).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(101);
    shared.lookup.mockResolvedValue(undefined);
    await drain(open(cache, synth));
    expect(synth).toHaveBeenCalledTimes(1);
    cache.dispose();
  });
  it('requires explicit configuration and a tenant/call/room scope', () => {
    const env = {
      TTS_SHARED_CACHE_ENABLED: 'true',
      API_BASE_URL: 'http://fixture',
      WORKER_CALLBACK_SECRET: 'fixture',
    };
    expect(TtsSharedCacheClient.create(call, org, 'room', env)).toBeDefined();
    expect(
      TtsSharedCacheClient.create(call, org, 'room', {
        ...env,
        TTS_SHARED_CACHE_ENABLED: 'false',
      }),
    ).toBeUndefined();
    expect(
      TtsSharedCacheClient.create(undefined, org, 'room', env),
    ).toBeUndefined();
    expect(
      TtsSharedCacheClient.create(call, undefined, 'room', env),
    ).toBeUndefined();
    expect(
      TtsSharedCacheClient.create(call, org, undefined, env),
    ).toBeUndefined();
    expect(TtsSharedCacheClient.create(call, org, 'room', {})).toBeUndefined();
  });
});
