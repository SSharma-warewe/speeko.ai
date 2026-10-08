import { ReadableStream } from 'node:stream/web';
import { AudioFrame } from '@livekit/rtc-node';
import {
  initializeLogger,
  metrics,
  tts,
  voice,
  type APIConnectOptions,
} from '@livekit/agents';
import { JobMeta, type AgentJobMetadata } from '../../session/job-metadata';
import { resolveTtsConfiguration } from '../../builders/model-builder';
import { TtsCacheRuntime } from '../../speech/tts-cache-runtime';
import { createCachedTtsNode } from '../../speech/cached-tts-node';
import { preserveTtsRequestUsage } from '../../speech/tts-usage';
import type { TtsSharedCache } from '../../speech/tts-shared-cache-client';
import {
  decodeCacheEntry,
  encodeCacheEntry,
} from '../../speech/tts-cache-envelope';
import { CallbackFunctions } from '../../callbacks/call-callbacks';
import { WorkerApiClient } from '../../callbacks/worker-api-client';
import { createCallsHarness } from '../../../../api/src/calls/test/helpers/calls-mocks';
import { CallStatus } from '../../../../api/src/calls/call.entity';
import { priceAttempt } from '../../../../api/src/price/price.calculator';

const phrase = 'A complete fixture sentence for speech.';

// Mock only transport: stream lifecycle, metric emission and collection are SDK code.
class FixtureStream extends tts.ChunkedStream {
  label = 'fixture.ChunkedStream';
  constructor(
    text: string,
    readonly owner: FixtureTts,
    options?: APIConnectOptions,
    signal?: AbortSignal,
  ) {
    super(text, owner, options, signal);
  }
  protected async run() {
    this.setTokenUsage({ inputTokens: 3, outputTokens: 5 });
    this.queue.put({
      requestId: `fixture-${this.owner.requests}`,
      segmentId: 'fixture',
      frame: new AudioFrame(new Int16Array(240).fill(7), 24000, 1, 240),
      final: true,
    });
    await this.owner.afterFrame?.(this.abortSignal);
  }
}
class FixtureTts extends tts.TTS {
  label = 'fixture.TTS';
  requests = 0;
  afterFrame?: (signal: AbortSignal) => Promise<void>;
  constructor(streaming = false) {
    super(24000, 1, { streaming });
  }
  get provider() {
    return 'inworld';
  }
  get model() {
    return 'inworld-tts-2';
  }
  synthesize(text: string, options?: APIConnectOptions, signal?: AbortSignal) {
    this.requests++;
    return new FixtureStream(text, this, options, signal);
  }
  stream(): tts.SynthesizeStream {
    if (!this.capabilities.streaming) throw new Error('Non-streaming fixture');
    this.requests++;
    return new FixtureLiveStream(this);
  }
}
class FixtureLiveStream extends tts.SynthesizeStream {
  label = 'fixture.SynthesizeStream';
  constructor(readonly owner: FixtureTts) {
    super(owner);
  }
  protected async run() {
    for await (const _text of this.input) {
      /* finite input closes normally */
    }
    this.markStarted();
    this.setTokenUsage({ inputTokens: 3, outputTokens: 5 });
    this.queue.put({
      requestId: `fixture-${this.owner.requests}`,
      segmentId: 'fixture',
      frame: new AudioFrame(new Int16Array(240).fill(7), 24000, 1, 240),
      final: !this.owner.afterFrame,
    });
    await this.owner.afterFrame?.(this.abortSignal);
    this.queue.put(tts.SynthesizeStream.END_OF_STREAM);
  }
}
function fixture(shared?: TtsSharedCache, streaming = false) {
  const meta: AgentJobMetadata = {
    organizationId: '11111111-1111-4111-8111-111111111111',
    callId: '33333333-3333-4333-8333-333333333333',
    agentKey: 'outbound',
    direction: 'outbound',
    task: 'general',
    enabledTools: ['endCall'],
    prompt: { systemPrompt: 'Fixture' },
    ttsModel: streaming ? 'inworld/inworld-tts-2' : 'openai/gpt-4o-mini-tts',
    ttsCacheEnabled: true,
  };
  const provider = preserveTtsRequestUsage(new FixtureTts(streaming));
  const collector = new metrics.ModelUsageCollector();
  const events: metrics.TTSMetrics[] = [];
  provider.on('metrics_collected', (event) => {
    events.push(event);
    collector.collect(event);
  });
  const cache = new TtsCacheRuntime(
    meta,
    resolveTtsConfiguration(meta),
    provider,
    {},
    Date.now,
    shared,
  );
  const agent = new voice.Agent({ instructions: 'Fixture', tts: provider });
  jest.spyOn(agent, 'getActivityOrThrow').mockReturnValue({
    tts: provider,
    _resolveExpressiveOptions: () => undefined,
    agentSession: {
      connOptions: {
        ttsConnOptions: { maxRetry: 0, retryIntervalMs: 0, timeoutMs: 1000 },
      },
    },
  } as ReturnType<voice.Agent['getActivityOrThrow']>);
  const generated = () =>
    createCachedTtsNode(cache)(
      {
        agent,
        tts: provider,
        session: { _expressive: false },
      } as Parameters<NonNullable<voice.AgentHooks['ttsNode']>>[0],
      (async function* () {
        yield phrase;
      })(),
      {},
    );
  return { cache, provider, collector, events, generated };
}
async function drain(
  stream: ReadableStream<AudioFrame> | AsyncIterable<AudioFrame>,
) {
  const frames = [];
  for await (const frame of stream) frames.push(frame);
  await new Promise<void>((resolve) => setImmediate(resolve));
  return frames;
}

describe('TTS cache SDK usage accounting', () => {
  beforeAll(() => initializeLogger({ pretty: false, level: 'silent' }));
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['finite', false],
    ['generated', false],
    ['finite', true],
    ['generated', true],
  ] as const)(
    'counts cold %s synthesis once (native stream %s) and local replay zero times',
    async (mode, streaming) => {
      const f = fixture(undefined, streaming);
      try {
        const speak = async () =>
          drain(
            mode === 'finite'
              ? f.cache.finiteAudio(phrase)
              : (await f.generated())!,
          );
        await speak();
        const cold = f.collector.flatten();
        expect(f.provider.requests).toBe(1);
        expect(cold).toEqual([
          expect.objectContaining({
            type: 'tts_usage',
            charactersCount: phrase.length,
            audioDurationMs: 10,
            inputTokens: 3,
            outputTokens: 5,
          }),
        ]);
        expect(await speak()).toHaveLength(1);
        expect(f.provider.requests).toBe(1);
        expect(f.collector.flatten()).toEqual(cold);
      } finally {
        f.cache.dispose();
      }
    },
  );

  it('ordinary SDK REST speech reports request usage once with caching disabled', async () => {
    const f = fixture();
    try {
      const agent = new voice.Agent({
        instructions: 'Fixture',
        tts: f.provider,
      });
      jest.spyOn(agent, 'getActivityOrThrow').mockReturnValue({
        tts: f.provider,
        _resolveExpressiveOptions: () => undefined,
        agentSession: { connOptions: { ttsConnOptions: { maxRetry: 0 } } },
      } as ReturnType<voice.Agent['getActivityOrThrow']>);
      const speak = () =>
        voice.Agent.default.ttsNode(
          agent,
          new ReadableStream<string>({
            start(output) {
              output.enqueue(phrase);
              output.close();
            },
          }),
          {},
        );
      await drain((await speak())!);
      await drain((await speak())!);
      expect(f.provider.requests).toBe(2);
      expect(f.collector.flatten()).toEqual([
        expect.objectContaining({
          charactersCount: phrase.length * 2,
          audioDurationMs: 20,
          inputTokens: 6,
          outputTokens: 10,
        }),
      ]);
    } finally {
      f.cache.dispose();
    }
  });

  it('preserves failed streaming request usage without publishing its partial audio', async () => {
    const f = fixture(undefined, true);
    f.provider.afterFrame = async () => {
      throw new Error('Fixture transport failure');
    };
    try {
      await expect(drain(f.cache.finiteAudio(phrase))).rejects.toThrow(
        'Fixture transport failure',
      );
      expect(f.cache.stats.entries).toBe(0);
      expect(f.collector.flatten()).toEqual([
        expect.objectContaining({
          charactersCount: phrase.length,
          audioDurationMs: 10,
        }),
      ]);
      f.provider.afterFrame = undefined;
      await drain(f.cache.finiteAudio(phrase));
      expect(f.provider.requests).toBe(2);
      expect(f.cache.stats.entries).toBe(1);
    } finally {
      f.cache.dispose();
    }
  });

  it('a separate call replays a shared entry without provider usage', async () => {
    const stored = new Map<string, ReturnType<typeof encodeCacheEntry>>();
    const sharing: TtsSharedCache = {
      lookup: async (key) =>
        stored.has(key)
          ? decodeCacheEntry(stored.get(key)!, Date.now() + 60000)
          : undefined,
      publish: (key, entry) => {
        stored.set(key, encodeCacheEntry(entry));
      },
      dispose() {},
    };
    const first = fixture(sharing),
      second = fixture(sharing);
    try {
      await drain(first.cache.finiteAudio(phrase));
      await drain(second.cache.finiteAudio(phrase));
      expect(first.provider.requests).toBe(1);
      expect(second.provider.requests).toBe(0);
      expect(second.collector.flatten()).toEqual([]);
      expect(second.cache.stats.sharedHits).toBe(1);
    } finally {
      first.cache.dispose();
      second.cache.dispose();
    }
  });

  it('accounts both concurrent sources after the fill wait expires', async () => {
    const f = fixture();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    f.provider.afterFrame = () => pending;
    try {
      const first = drain(f.cache.finiteAudio(phrase));
      const second = drain(f.cache.finiteAudio(phrase));
      await new Promise((resolve) => setTimeout(resolve, 45));
      finish();
      await Promise.all([first, second]);
      expect(f.provider.requests).toBe(2);
      expect(f.collector.flatten()).toEqual([
        expect.objectContaining({
          charactersCount: phrase.length * 2,
          audioDurationMs: 20,
        }),
      ]);
      expect(f.cache.stats.entries).toBe(1);
    } finally {
      finish();
      f.cache.dispose();
    }
  });

  it('retains SDK-reported usage when an interrupted partial capture is discarded', async () => {
    const f = fixture();
    f.provider.afterFrame = (signal) =>
      new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true });
        if (signal.aborted) resolve();
      });
    const reader = f.cache.finiteAudio(phrase).getReader();
    try {
      await reader.read();
      await reader.cancel();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(f.cache.stats.entries).toBe(0);
      expect(f.collector.flatten()).toEqual([
        expect.objectContaining({
          charactersCount: phrase.length,
          audioDurationMs: 10,
        }),
      ]);
    } finally {
      reader.releaseLock();
      f.cache.dispose();
    }
  });

  it('carries real SDK usage through completion persistence and existing pricing', async () => {
    const f = fixture();
    try {
      await drain(f.cache.finiteAudio(phrase));
      await drain(f.cache.finiteAudio(phrase));
      const usage = new JobMeta().serializeUsage({
        modelUsage: f.collector.flatten(),
      });
      const harness = createCallsHarness();
      const call = harness.makeCall({ status: CallStatus.READY });
      harness.callsRepository.findById.mockResolvedValue(call);
      harness.priceService.applyAttemptToCall.mockImplementation(
        async (row) => {
          const priced = priceAttempt(
            { attempt: 1, medium: 'meet', usage: row.usage },
            {
              plan: 'ship',
              agentDeployed: false,
              sipVendorUsdPerMin: 0,
            },
          );
          expect(priced.lines.filter((line) => line.key === 'tts')).toEqual([
            expect.objectContaining({
              quantity: phrase.length,
              unit: 'characters',
            }),
          ]);
        },
      );
      const client = new WorkerApiClient({
        env: {
          API_BASE_URL: 'http://fixture',
          WORKER_CALLBACK_SECRET: 'fixture-secret',
        },
        fetch: jest.fn(async (_url, init) => {
          await harness.worker.completeFromWorker(
            call.id,
            JSON.parse(init!.body as string),
          );
          return new Response('{}', { status: 200 });
        }),
      });
      await new CallbackFunctions(client).postCallComplete(call.id, {
        status: 'completed',
        taskCompleted: true,
        usage,
      });
      expect(harness.callsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ usage }),
      );
      expect(harness.priceService.applyAttemptToCall).toHaveBeenCalledTimes(1);
      expect(usage).not.toHaveProperty('synthesisInvocations');
    } finally {
      f.cache.dispose();
    }
  });

  it('logs bounded numeric cache/first-frame timings once, without speech or audio', async () => {
    const f = fixture();
    await drain(f.cache.finiteAudio(phrase));
    await drain(f.cache.finiteAudio(phrase));
    f.cache.dispose();
    f.cache.dispose();
    const logs = (console.log as jest.Mock).mock.calls.filter(([value]) =>
      value.startsWith('[agent] tts-cache '),
    );
    expect(logs).toHaveLength(1);
    const stats = JSON.parse(logs[0][0].slice('[agent] tts-cache '.length));
    expect(stats.cacheWaitMs.count).toBe(2);
    expect(stats.segmentToFirstFrameMs.count).toBe(2);
    expect(stats.cacheWaitMs.buckets).toHaveLength(11);
    expect(
      stats.segmentToFirstFrameMs.buckets.reduce(
        (sum: number, count: number) => sum + count,
        0,
      ),
    ).toBe(2);
    expect(logs[0][0]).not.toContain(phrase);
    expect(stats).not.toHaveProperty('frames');
    expect(stats).not.toHaveProperty('timings');
  });
});
