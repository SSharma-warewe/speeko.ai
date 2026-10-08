import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { AudioFrame } from '@livekit/rtc-node';
import type { tts } from '@livekit/agents';
import type { AgentJobMetadata } from '@call-agent/contracts';
import { resolveTtsConfiguration } from '../../builders/model-builder';
import { TtsCacheRuntime } from '../../speech/tts-cache-runtime';
import { preparedSentences } from '../../speech/prepared-sentences';
import { sayCached } from '../../speech/tts-cache';
import type { TtsSharedCache } from '../../speech/tts-shared-cache-client';

const meta = (extra: Partial<AgentJobMetadata> = {}): AgentJobMetadata => ({
  agentKey: 'fixture',
  direction: 'inbound',
  task: 'general',
  organizationId: 'org-fixture',
  enabledTools: ['endCall'],
  prompt: { systemPrompt: 'Fixture' },
  ttsModel: 'sarvam/bulbul-v3',
  voice: 'ritu',
  ...extra,
});
const frame = () => new AudioFrame(new Int16Array([7, 7]), 24000, 1, 2);
const caches: TtsCacheRuntime[] = [];
function fixture(automaticEnabled = false, shared?: TtsSharedCache) {
  const provider = Object.assign(new EventEmitter(), {
    sampleRate: 24000,
    numChannels: 1,
    close: jest.fn(),
    synthesize: jest.fn(() => clip()),
  }) as unknown as tts.TTS;
  const cache = new TtsCacheRuntime(
    meta(),
    resolveTtsConfiguration(meta()),
    provider,
    { automaticEnabled },
    Date.now,
    shared,
  );
  caches.push(cache);
  return { cache, provider, synthesize: jest.mocked(provider.synthesize) };
}
function clip(gate: Promise<void> = Promise.resolve()) {
  return {
    abortSignal: new AbortController().signal,
    close: jest.fn(),
    async *[Symbol.asyncIterator]() {
      await gate;
      yield { frame: frame() };
    },
  } as unknown as tts.ChunkedStream;
}
async function drain(stream: ReadableStream<AudioFrame>) {
  const reader = stream.getReader();
  let count = 0;
  try {
    while (!(await reader.read()).done) count++;
  } finally {
    reader.releaseLock();
  }
  return count;
}
const flush = () => jest.advanceTimersByTimeAsync(0);

describe('parallel prepared sentences and cleanup', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    caches.splice(0).forEach((cache) => cache.dispose());
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('deduplicates fixed lines, excludes generated openings and native realtime', () => {
    const lines = preparedSentences(meta());
    expect(lines.length).toBeGreaterThan(5);
    expect(new Set(lines).size).toBe(lines.length);
    expect(lines).not.toContain('Fixture');
    expect(
      preparedSentences(meta({ model: 'openai/gpt-realtime-2.1' })),
    ).toEqual([]);
    expect(
      preparedSentences(meta({ direction: 'outbound', task: 'demo_booking' })),
    ).toContain('Let me check the calendar for that.');
    expect(
      preparedSentences(
        meta({
          prompt: { systemPrompt: 'Fixture', onExitInstructions: '' },
          direction: 'outbound',
        }),
      ),
    ).toEqual([]);
  });
  it('runs only two preparation sources, then replays without new synthesis', async () => {
    const { cache, synthesize } = fixture(true);
    const release: Array<() => void> = [];
    synthesize.mockImplementation(() =>
      clip(new Promise<void>((resolve) => release.push(resolve))),
    );
    const work = cache.prepare(['a', 'b', 'c', 'd', 'a']);
    await flush();
    expect(synthesize).toHaveBeenCalledTimes(2);
    release[0]();
    await flush();
    expect(synthesize).toHaveBeenCalledTimes(3);
    release[1]();
    await flush();
    expect(synthesize).toHaveBeenCalledTimes(4);
    release[2]();
    release[3]();
    await work;
    expect(cache.stats.entries).toBe(4);
    expect(cache.stats.active).toBe(0);
    expect(cache.stats.captureBytes).toBe(0);
    expect(await drain(cache.finiteAudio('a'))).toBe(1);
    expect(synthesize).toHaveBeenCalledTimes(4);
  });
  it('works with automatic caching off and releases local audio after playback', async () => {
    const shared = {
      lookup: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn(),
      dispose: jest.fn(),
    };
    const { cache, synthesize } = fixture(false, shared);
    await cache.prepare(['question']);
    expect(cache.automaticEnabled).toBe(false);
    expect(cache.canCacheFinite('question')).toBe(true);
    expect(cache.canCacheFinite('generated reply')).toBe(false);
    const say = jest.fn();
    sayCached({ say }, cache, 'generated reply', { addToChatCtx: true });
    expect(say).toHaveBeenCalledWith('generated reply', { addToChatCtx: true });
    expect(shared.lookup.mock.calls[0][3]).toBe('prepared');
    expect(shared.publish.mock.calls[0][2]).toBe('prepared');
    expect(await drain(cache.finiteAudio('question'))).toBe(1);
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(cache.stats).toMatchObject({
      residentBytes: 0,
      entries: 0,
      captureBytes: 0,
      active: 0,
      pending: 0,
    });
  });
  it('imports shared prepared audio without contacting TTS', async () => {
    const shared = {
      lookup: jest.fn().mockResolvedValue({
        frames: [
          {
            data: new Int16Array([7, 7]),
            sampleRate: 24000,
            channels: 1,
            samplesPerChannel: 2,
            timings: [],
          },
        ],
        bytes: 68,
        expires: Date.now() + 60000,
      }),
      publish: jest.fn(),
      dispose: jest.fn(),
    };
    const { cache, synthesize } = fixture(false, shared);
    await cache.prepare(['shared']);
    expect(await drain(cache.finiteAudio('shared'))).toBe(1);
    expect(synthesize).not.toHaveBeenCalled();
    expect(shared.publish).not.toHaveBeenCalled();
  });
  it('foreground playback cancels a stalled preparation after the short wait', async () => {
    const { cache, synthesize } = fixture();
    const stalled = clip(new Promise<void>(() => {}));
    synthesize.mockReturnValueOnce(stalled);
    const preparation = cache.prepare(['question']);
    await flush();
    const playback = drain(cache.finiteAudio('question'));
    await jest.advanceTimersByTimeAsync(25);
    expect(await playback).toBe(1);
    await preparation;
    expect(stalled.close).toHaveBeenCalled();
    expect(synthesize).toHaveBeenCalledTimes(2);
    expect(cache.stats).toMatchObject({
      active: 0,
      pending: 0,
      captureBytes: 0,
      residentBytes: 0,
    });
  });
  it('times out stalled phrases and stops the queue after thirty seconds', async () => {
    const { cache, synthesize } = fixture();
    synthesize.mockImplementation(() => clip(new Promise<void>(() => {})));
    const preparation = cache.prepare(
      Array.from({ length: 20 }, (_, n) => String(n)),
    );
    await jest.advanceTimersByTimeAsync(30000);
    await preparation;
    expect(synthesize).toHaveBeenCalledTimes(6);
    expect(cache.stats).toMatchObject({
      active: 0,
      pending: 0,
      captureBytes: 0,
      residentBytes: 0,
    });
    expect(jest.getTimerCount()).toBe(1); // Only the expiry sweep remains.
  });
  it('sweeps expired local entries without another lookup', async () => {
    const { cache } = fixture(true);
    await cache.prepare(['question']);
    expect(cache.stats.entries).toBe(1);
    await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(cache.stats).toMatchObject({ entries: 0, residentBytes: 0 });
  });
  it('hangup stops preparation while retaining completed closing audio for drain', async () => {
    const { cache, provider, synthesize } = fixture();
    synthesize.mockImplementation((text) =>
      clip(
        text === 'closing' ? Promise.resolve() : new Promise<void>(() => {}),
      ),
    );
    const preparation = cache.prepare(['closing', 'question', 'other']);
    await flush();
    cache.beginShutdown();
    await preparation;
    expect(cache.stats).toMatchObject({
      entries: 1,
      active: 0,
      preparing: 0,
      pending: 0,
      captureBytes: 0,
    });
    expect(await drain(cache.finiteAudio('closing'))).toBe(1);
    expect(cache.stats.residentBytes).toBe(0);
    expect(provider.close).not.toHaveBeenCalled();
  });
  it('aborts oversized speculative clips without retaining or publishing audio', async () => {
    const shared = {
      lookup: jest.fn(),
      publish: jest.fn(),
      dispose: jest.fn(),
    };
    const { cache, synthesize } = fixture(false, shared);
    synthesize.mockImplementation(
      () =>
        ({
          abortSignal: new AbortController().signal,
          close: jest.fn(),
          async *[Symbol.asyncIterator]() {
            yield {
              frame: new AudioFrame(
                new Int16Array(24000 * 16),
                24000,
                1,
                24000 * 16,
              ),
            };
          },
        }) as unknown as tts.ChunkedStream,
    );
    await cache.prepare(['too long']);
    expect(cache.stats).toMatchObject({
      residentBytes: 0,
      captureBytes: 0,
      pending: 0,
      active: 0,
    });
    expect(shared.publish).not.toHaveBeenCalled();
  });
  it('repeated disposal clears stalled sources, buffers, timers and listeners', async () => {
    const shared = {
      lookup: jest.fn(),
      publish: jest.fn(),
      dispose: jest.fn(),
    };
    for (let i = 0; i < 4; i++) {
      const { cache, provider, synthesize } = fixture(false, shared);
      synthesize.mockImplementation(() => clip(new Promise<void>(() => {})));
      const preparation = cache.prepare(['a', 'b', 'c']);
      await flush();
      cache.dispose();
      cache.dispose();
      await preparation;
      expect(cache.stats).toMatchObject({
        active: 0,
        pending: 0,
        captureBytes: 0,
        residentBytes: 0,
        entries: 0,
      });
      expect(provider.listenerCount('error')).toBe(0);
      expect(provider.close).not.toHaveBeenCalled();
      expect(synthesize).toHaveBeenCalledTimes(2);
    }
    expect(shared.dispose).toHaveBeenCalledTimes(4);
    expect(jest.getTimerCount()).toBe(0);
  });
});
