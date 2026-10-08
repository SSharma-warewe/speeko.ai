import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { AudioFrame } from '@livekit/rtc-node';
import type { tts } from '@livekit/agents';
import type { AgentJobMetadata } from '../../session/job-metadata';
import { resolveTtsConfiguration } from '../../builders/model-builder';
import {
  TtsCacheRuntime,
  type TtsCachePolicy,
} from '../../speech/tts-cache-runtime';
import { sayCached } from '../../speech/tts-cache';

const metadata = (extra: Partial<AgentJobMetadata> = {}): AgentJobMetadata => ({
  agentKey: 'inbound',
  direction: 'inbound',
  task: 'general',
  organizationId: 'org-1',
  prompt: { systemPrompt: 'Test' },
  enabledTools: ['endCall'],
  ttsModel: 'sarvam/bulbul-v3',
  voice: 'ritu',
  ...extra,
});
const frame = (value = 1) =>
  new AudioFrame(new Int16Array([value, value]), 24000, 1, 2);
function fixture(
  extra: Partial<AgentJobMetadata> = {},
  policy: Partial<TtsCachePolicy> = {},
  now?: () => number,
) {
  const provider = Object.assign(new EventEmitter(), {
    sampleRate: 24000,
    numChannels: 1,
    close: jest.fn(),
    synthesize: jest.fn(),
    stream: jest.fn(),
  }) as unknown as tts.TTS;
  const meta = metadata(extra);
  return {
    provider,
    cache: new TtsCacheRuntime(
      meta,
      resolveTtsConfiguration(meta),
      provider,
      policy,
      now,
    ),
  };
}
async function drain(stream: ReadableStream<AudioFrame>) {
  const reader = stream.getReader();
  const frames: AudioFrame[] = [];
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      frames.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return frames;
}
const source = (...frames: AudioFrame[]) =>
  jest.fn(
    () =>
      new ReadableStream<AudioFrame>({
        start(output) {
          frames.forEach((f) => output.enqueue(f));
          output.close();
        },
      }),
  );
const open = (
  cache: TtsCacheRuntime,
  text: string,
  factory: ReturnType<typeof source>,
) => cache.open(text, 'rest', 'test-v1', factory);

describe('job-local TTS cache', () => {
  afterEach(() => jest.restoreAllMocks());
  it('streams before completion, captures once, and replays owned fresh frames', async () => {
    const { cache } = fixture();
    const original = frame(5);
    original.userdata['lk.tts_started_time'] = -100;
    original.userdata.secret = 'not replay metadata';
    original.userdata['lk.timed_transcripts'] = [
      { text: 'Hello', startTime: 0, endTime: 0.2 },
    ];
    let output!: ReadableStreamDefaultController<AudioFrame>;
    const factory = jest.fn(
      () =>
        new ReadableStream<AudioFrame>({
          start(controller) {
            output = controller;
            controller.enqueue(original);
          },
        }),
    );
    const reader = cache.open('Hello', 'rest', 'test-v1', factory).getReader();
    expect((await reader.read()).value).toBe(original);
    expect(cache.stats.entries).toBe(0);
    original.data[0] = 99;
    output.close();
    expect((await reader.read()).done).toBe(true);
    const first = await drain(
      cache.open('Hello', 'rest', 'test-v1', factory, { offset: 2 }),
    );
    expect(first[0].data[0]).toBe(5);
    expect(first[0]).not.toBe(original);
    expect(first[0].userdata.secret).toBeUndefined();
    expect(first[0].userdata['lk.tts_started_time']).toBeGreaterThan(0);
    expect(
      (
        first[0].userdata['lk.timed_transcripts'] as Array<{
          startTime: number;
        }>
      )[0].startTime,
    ).toBe(2);
    first[0].data[0] = 20;
    expect((await drain(open(cache, 'Hello', factory)))[0].data[0]).toBe(5);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(cache.stats.synthesisInvocations).toBe(1);
    expect(cache.stats.captureBytes).toBe(0);
    cache.dispose();
  });
  it('expires entries and evicts the least recently used entry', async () => {
    let clock = 0;
    const { cache } = fixture({}, { ttlMs: 100, maxBytes: 150 }, () => clock);
    const factory = source(frame());
    await drain(open(cache, 'a', factory));
    await drain(open(cache, 'b', factory));
    await drain(open(cache, 'a', factory));
    await drain(open(cache, 'c', factory));
    expect(cache.stats.entries).toBe(2);
    expect(cache.stats.residentBytes).toBeLessThanOrEqual(150);
    await drain(open(cache, 'a', factory));
    expect(factory).toHaveBeenCalledTimes(3);
    await drain(open(cache, 'b', factory));
    expect(factory).toHaveBeenCalledTimes(4);
    clock = 101;
    await drain(open(cache, 'b', factory));
    expect(factory).toHaveBeenCalledTimes(5);
    cache.dispose();
  });
  it.each([
    { maxEntryBytes: 1 },
    { maxEntrySeconds: 0 },
    { maxCaptureBytes: 1 },
  ])(
    'bypasses capture limits without stopping live audio: %j',
    async (policy) => {
      const { cache } = fixture({}, policy);
      const factory = source(frame(), frame(2));
      expect(await drain(open(cache, 'a', factory))).toHaveLength(2);
      expect(cache.stats.entries).toBe(0);
      expect(cache.stats.captureBytes).toBe(0);
      await drain(open(cache, 'a', factory));
      expect(factory).toHaveBeenCalledTimes(2);
      cache.dispose();
    },
  );
  it('does not publish empty, failed, or normally ended SDK-error captures', async () => {
    const { cache, provider } = fixture();
    await drain(open(cache, 'empty', source()));
    const failure = () =>
      new ReadableStream<AudioFrame>({
        pull(output) {
          output.error(new Error('failed'));
        },
      });
    await expect(
      drain(cache.open('error', 'rest', 'test-v1', failure)),
    ).rejects.toThrow('failed');
    const sdkFailure = () =>
      new ReadableStream<AudioFrame>({
        start(output) {
          output.enqueue(frame());
          provider.emit('error', { recoverable: false });
          output.close();
        },
      });
    await drain(cache.open('sdk-error', 'rest', 'test-v1', sdkFailure));
    expect(cache.stats.entries).toBe(0);
    expect(cache.stats.pending).toBe(0);
    cache.dispose();
  });
  it('shares quick concurrent fills without a second provider request', async () => {
    const { cache } = fixture();
    let output!: ReadableStreamDefaultController<AudioFrame>;
    const factory = jest.fn(
      () =>
        new ReadableStream<AudioFrame>({
          start(controller) {
            output = controller;
            controller.enqueue(frame());
          },
        }),
    );
    const first = open(cache, 'a', factory).getReader();
    await first.read();
    const duplicate = drain(open(cache, 'a', factory));
    output.close();
    await first.read();
    expect(await duplicate).toHaveLength(1);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(cache.stats.dedupWaits).toBe(1);
    cache.dispose();
  });
  it('bounds fill waiting and publishes the first successful competing result', async () => {
    jest.useFakeTimers();
    const { cache } = fixture();
    let output!: ReadableStreamDefaultController<AudioFrame>;
    const firstSource = () =>
      new ReadableStream<AudioFrame>({
        start(controller) {
          output = controller;
          controller.enqueue(frame(1));
        },
      });
    const first = cache.open('a', 'rest', 'test-v1', firstSource).getReader();
    await first.read();
    const competitor = source(frame(2));
    const second = drain(open(cache, 'a', competitor));
    await jest.advanceTimersByTimeAsync(25);
    expect(await second).toHaveLength(1);
    expect(competitor).toHaveBeenCalledTimes(1);
    output.close();
    await first.read();
    expect((await drain(open(cache, 'a', competitor)))[0].data[0]).toBe(2);
    expect(cache.stats.synthesisInvocations).toBe(2);
    cache.dispose();
    jest.useRealTimers();
  });
  it('releases partial capture and pending fills during cancellation of a stalled read', async () => {
    const { cache, provider } = fixture();
    const cancel = jest.fn();
    const reader = cache
      .open(
        'a',
        'rest',
        'test-v1',
        () =>
          new ReadableStream<AudioFrame>({
            start(output) {
              output.enqueue(frame());
            },
            cancel,
          }),
      )
      .getReader();
    await reader.read();
    const pendingRead = reader.read();
    await reader.cancel();
    await pendingRead;
    expect(cancel).toHaveBeenCalled();
    expect(cache.stats.entries).toBe(0);
    expect(cache.stats.captureBytes).toBe(0);
    expect(cache.stats.pending).toBe(0);
    cache.dispose();
    expect(provider.close).not.toHaveBeenCalled();
  });
  it('disposes active operations, clears entries, and never closes the provider', async () => {
    const { cache, provider } = fixture();
    await drain(open(cache, 'ready', source(frame())));
    const cancel = jest.fn();
    const reader = cache
      .open(
        'active',
        'rest',
        'test-v1',
        () =>
          new ReadableStream<AudioFrame>({
            start(output) {
              output.enqueue(frame());
            },
            cancel,
          }),
      )
      .getReader();
    await reader.read();
    const pendingRead = reader.read();
    cache.dispose();
    await expect(pendingRead).rejects.toThrow('aborted');
    expect(cache.stats.entries).toBe(0);
    expect(cache.stats.captureBytes).toBe(0);
    expect(cache.stats.active).toBe(0);
    expect(cancel).toHaveBeenCalled();
    expect(provider.close).not.toHaveBeenCalled();
    expect(provider.listenerCount('error')).toBe(0);
  });
  it('keeps playback running when publication fails after audio starts', async () => {
    const { cache } = fixture();
    jest
      .spyOn(cache as unknown as { publish: () => void }, 'publish')
      .mockImplementation(() => {
        throw new Error('cache storage');
      });
    expect(
      await drain(open(cache, 'a', source(frame(), frame(2)))),
    ).toHaveLength(2);
    expect(cache.stats.synthesisInvocations).toBe(1);
    expect(cache.stats.writeFailures).toBe(1);
    cache.dispose();
  });
  it('falls back once to live synthesis when local lookup fails', async () => {
    const { cache } = fixture();
    const factory = source(frame());
    jest
      .spyOn(cache as unknown as { lookup: () => void }, 'lookup')
      .mockImplementation(() => {
        throw new Error('lookup failed');
      });
    expect(await drain(open(cache, 'a', factory))).toHaveLength(1);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(cache.stats.entries).toBe(0);
    expect(cache.stats.bypassReasons['lookup-error']).toBe(1);
    cache.dispose();
  });
  it('discards audio after a partial failure and allows a later successful fill', async () => {
    const { cache } = fixture();
    let output!: ReadableStreamDefaultController<AudioFrame>;
    const reader = cache
      .open(
        'a',
        'rest',
        'test-v1',
        () =>
          new ReadableStream<AudioFrame>({
            start(controller) {
              output = controller;
              controller.enqueue(frame());
            },
          }),
      )
      .getReader();
    await reader.read();
    expect(cache.stats.captureBytes).toBeGreaterThan(0);
    output.error(new Error('partial failure'));
    await expect(reader.read()).rejects.toThrow('partial failure');
    expect(cache.stats.captureBytes).toBe(0);
    expect(cache.stats.pending).toBe(0);
    expect(cache.stats.entries).toBe(0);
    const successful = source(frame(2));
    await drain(open(cache, 'a', successful));
    expect(cache.stats.entries).toBe(1);
    expect((await drain(open(cache, 'a', successful)))[0].data[0]).toBe(2);
    expect(successful).toHaveBeenCalledTimes(1);
    cache.dispose();
  });
  it('keeps disabled helpers bound and passes normal say options', () => {
    const { cache } = fixture({}, { enabled: false });
    const session = {
      seen: false,
      say(this: { seen: boolean }, _text: string, _options: unknown) {
        this.seen = true;
        return 'handle';
      },
    };
    expect(sayCached(session, cache, 'Hello', { addToChatCtx: false })).toBe(
      'handle',
    );
    expect(session.seen).toBe(true);
    expect(cache.stats.synthesisInvocations).toBe(0);
    cache.dispose();
  });
  it.each([
    'inworld/inworld-tts-2',
    'fishaudio/s2.1-pro-free',
    'openai/gpt-4o-mini-tts',
    'xai/tts-1',
    'sarvam/bulbul-v3',
    'sarvam/bulbul-v3-realtime',
  ] as const)(
    'captures one finite %s source and replays without another request',
    async (ttsModel) => {
      const { cache, provider } = fixture({ ttsModel });
      const close = jest.fn();
      const input: string[] = [];
      const stream = {
        abortSignal: new AbortController().signal,
        close,
        updateInputStream: jest.fn(async (text: ReadableStream<string>) => {
          const reader = text.getReader();
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            input.push(next.value);
          }
          reader.releaseLock();
        }),
        async *[Symbol.asyncIterator]() {
          yield { frame: frame(7) };
        },
      };
      jest
        .mocked(provider.stream)
        .mockReturnValue(stream as unknown as ReturnType<tts.TTS['stream']>);
      jest
        .mocked(provider.synthesize)
        .mockReturnValue(
          stream as unknown as ReturnType<tts.TTS['synthesize']>,
        );
      const session = {
        say: jest.fn(
          (_text: string, options: { audio?: ReadableStream<AudioFrame> }) =>
            options.audio!,
        ),
      };
      expect(
        (await drain(sayCached(session, cache, 'finite line')))[0].data[0],
      ).toBe(7);
      expect(
        (await drain(sayCached(session, cache, 'finite line')))[0].data[0],
      ).toBe(7);
      const inference = cache.config.backend === 'livekit-inference';
      expect(provider.stream).toHaveBeenCalledTimes(inference ? 1 : 0);
      expect(provider.synthesize).toHaveBeenCalledTimes(inference ? 0 : 1);
      if (inference) expect(input).toEqual(['finite line']);
      expect(close).toHaveBeenCalledTimes(1);
      expect(cache.stats.synthesisInvocations).toBe(1);
      cache.dispose();
      expect(provider.close).not.toHaveBeenCalled();
    },
  );
});

describe('resolved cache identity', () => {
  it('canonicalizes aliases, voices and known rate defaults', () => {
    const a = fixture({ ttsModel: null, voice: null });
    const b = fixture({ ttsModel: 'inworld-tts-2', voice: 'Ashley' });
    expect(a.cache.identity('Hello', 'websocket', 'v1')).toBe(
      b.cache.identity('Hello', 'websocket', 'v1'),
    );
    a.cache.dispose();
    b.cache.dispose();
    const c = fixture({ speakingRate: null });
    const d = fixture({ speakingRate: 1 });
    expect(c.cache.identity('Hello', 'rest', 'v1')).toBe(
      d.cache.identity('Hello', 'rest', 'v1'),
    );
    c.cache.dispose();
    d.cache.dispose();
  });
  it.each([
    { organizationId: 'org-2' },
    { voice: 'neha' },
    { speechLanguage: 'hi-IN' },
    { speakingRate: 1.2 },
    { prompt: { systemPrompt: 'हिंदी में बात करें।' } },
  ])('separates audio-affecting config or tenant: %j', async (extra) => {
    const a = fixture();
    const b = fixture(extra);
    expect(a.cache.identity('Hello', 'rest', 'v1')).not.toBe(
      b.cache.identity('Hello', 'rest', 'v1'),
    );
    a.cache.dispose();
    b.cache.dispose();
  });
  it('separates transport, transform, text, delivery and missing-tenant jobs', () => {
    const { cache } = fixture();
    expect(cache.identity('Hello', 'rest', 'v1')).not.toBe(
      cache.identity('Hello', 'websocket', 'v1'),
    );
    expect(cache.identity('Hello', 'rest', 'v1')).not.toBe(
      cache.identity('Hello', 'rest', 'v2'),
    );
    expect(cache.identity('Hello', 'rest', 'v1')).not.toBe(
      cache.identity(' Hello', 'rest', 'v1'),
    );
    const a = fixture({
      ttsModel: 'inworld/inworld-tts-2',
      deliveryMode: 'STABLE',
    });
    const b = fixture({
      ttsModel: 'inworld/inworld-tts-2',
      deliveryMode: 'CREATIVE',
    });
    expect(a.cache.identity('Hello', 'websocket', 'v1')).not.toBe(
      b.cache.identity('Hello', 'websocket', 'v1'),
    );
    const c = fixture({ organizationId: undefined });
    const d = fixture({ organizationId: undefined });
    expect(c.cache.identity('Hello', 'rest', 'v1')).not.toBe(
      d.cache.identity('Hello', 'rest', 'v1'),
    );
    [cache, a.cache, b.cache, c.cache, d.cache].forEach((value) =>
      value.dispose(),
    );
  });
});
