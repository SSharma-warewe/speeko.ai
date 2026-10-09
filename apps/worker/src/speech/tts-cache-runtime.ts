import { ReadableStream } from 'node:stream/web';
import { AudioFrame } from '@livekit/rtc-node';
import { voice, type tts } from '@livekit/agents';
import {
  TTS_CACHE_LIMITS,
  type AgentJobMetadata,
  type TtsCacheTiming as Timing,
} from '@call-agent/contracts';
import type {
  StoredFrame,
  TtsCacheEntry as Entry,
} from './tts-cache-envelope.js';
import type { TtsSharedCache } from './tts-shared-cache-client.js';
import { createTtsCacheSynthesizer } from './tts-cache-adapter.js';
import {
  cacheTenantScope,
  ttsCacheIdentity,
  type ResolvedTtsConfiguration,
} from './tts-cache-identity.js';

const TIMED = 'lk.timed_transcripts';
const STARTED = 'lk.tts_started_time';
type Pending = {
  promise: Promise<Entry | undefined>;
  resolve: (entry?: Entry) => void;
};
type Source = (
  signal: AbortSignal,
) => ReadableStream<AudioFrame> | Promise<ReadableStream<AudioFrame> | null>;
type Operation = { cancel: () => void };

// Disjoint timing buckets, retained at constant size for the job lifetime.
function latencyHistogram() {
  const boundsMs = [1, 5, 10, 25, 30, 50, 100, 250, 500, 1000];
  const buckets = new Array<number>(boundsMs.length + 1).fill(0);
  let count = 0,
    sumMs = 0,
    maxMs = 0;
  return {
    record(ms: number) {
      count++;
      sumMs += ms;
      maxMs = Math.max(maxMs, ms);
      const bucket = boundsMs.findIndex((bound) => ms <= bound);
      buckets[bucket < 0 ? boundsMs.length : bucket]++;
    },
    snapshot: () => ({
      count,
      sumMs,
      maxMs,
      boundsMs: [...boundsMs],
      buckets: [...buckets],
    }),
  };
}

export const DEFAULT_TTS_CACHE_POLICY = {
  enabled: true,
  automaticEnabled: true,
  maxBytes: 16 * 1024 * 1024,
  ttlMs: 10 * 60 * 1000,
  maxEntryBytes: 1024 * 1024,
  maxEntrySeconds: 15,
  maxCaptureBytes: 4 * 1024 * 1024,
  dedupWaitMs: 25,
} as const;
export type TtsCachePolicy = {
  [K in keyof typeof DEFAULT_TTS_CACHE_POLICY]: K extends
    'enabled' | 'automaticEnabled'
    ? boolean
    : number;
};

function storedFrame(frame: AudioFrame): StoredFrame {
  const timings =
    (frame.userdata[TIMED] as Timing[] | undefined)?.map((t) => ({
      text: t.text,
      startTime: t.startTime,
      endTime: t.endTime,
      confidence: t.confidence,
      startTimeOffset: t.startTimeOffset,
      speakerId: t.speakerId,
    })) ?? [];
  return {
    data: frame.data,
    sampleRate: frame.sampleRate,
    channels: frame.channels,
    samplesPerChannel: frame.samplesPerChannel,
    timings,
  };
}
function rebase(timings: Timing[], offset: number) {
  return timings.map((t) =>
    voice.createTimedString({
      ...t,
      startTime: t.startTime === undefined ? undefined : t.startTime + offset,
      endTime: t.endTime === undefined ? undefined : t.endTime + offset,
    }),
  );
}
function freshFrame(
  frame: StoredFrame,
  offset: number,
  started: number,
): AudioFrame {
  return new AudioFrame(
    frame.data.slice(),
    frame.sampleRate,
    frame.channels,
    frame.samplesPerChannel,
    {
      [STARTED]: started,
      ...(frame.timings.length
        ? { [TIMED]: rebase(frame.timings, offset) }
        : {}),
    },
  );
}

/** One disposable cache per job; never owns or closes the session provider. */
export class TtsCacheRuntime {
  readonly policy: TtsCachePolicy;
  readonly config: ResolvedTtsConfiguration;
  private readonly scope: string;
  private readonly entries = new Map<string, Entry>();
  private pinnedOpeningKey?: string;
  private readonly pending = new Map<string, Pending>();
  private readonly operations = new Set<Operation>();
  private residentBytes = 0;
  private captureBytes = 0;
  private errorEpoch = 0;
  private disposed = false;
  private readonly preparedTexts = new Set<string>();
  private readonly preparations = new Map<string, AbortController>();
  private preparationStarted = false;
  private shuttingDown = false;
  private preparationStop?: () => void;
  private readonly expiryTimer: ReturnType<typeof setInterval>;
  private readonly counts = {
    hits: 0,
    misses: 0,
    bypasses: 0,
    abortedCaptures: 0,
    evictions: 0,
    dedupWaits: 0,
    synthesisInvocations: 0,
    writeFailures: 0,
    sharedHits: 0,
  };
  private readonly bypassReasons: Record<string, number> = {};
  private readonly cacheWait = latencyHistogram();
  private readonly segmentToFirstFrame = latencyHistogram();
  private readonly finiteSynthesizer;
  private readonly onError = (event: { recoverable: boolean }): void => {
    if (!event.recoverable) this.errorEpoch++;
  };

  constructor(
    meta: AgentJobMetadata,
    config: ResolvedTtsConfiguration,
    readonly provider: tts.TTS,
    policy: Partial<TtsCachePolicy> = {},
    private readonly now: () => number = Date.now,
    private readonly shared?: TtsSharedCache,
  ) {
    this.policy = { ...DEFAULT_TTS_CACHE_POLICY, ...policy };
    this.config = structuredClone(config);
    this.scope = cacheTenantScope(meta);
    this.finiteSynthesizer = createTtsCacheSynthesizer(
      provider,
      config.backend === 'livekit-inference' ? 'stream' : 'chunked',
    );
    provider.on('error', this.onError);
    this.expiryTimer = setInterval(() => this.sweepExpired(), 30_000);
    this.expiryTimer.unref?.();
  }
  get enabled(): boolean {
    return this.policy.enabled && !this.disposed;
  }
  get automaticEnabled(): boolean {
    return this.enabled && this.policy.automaticEnabled;
  }
  canCacheFinite(text: string): boolean {
    return (
      this.enabled && (this.automaticEnabled || this.preparedTexts.has(text))
    );
  }
  registerPreparedTexts(lines: readonly string[]): void {
    if (!this.enabled || this.shuttingDown) return;
    for (const text of lines) if (text.trim()) this.preparedTexts.add(text);
  }
  /** Stop speculative work while retaining audio needed for the draining goodbye. */
  beginShutdown(): void {
    this.shuttingDown = true;
    this.preparationStop?.();
    this.shared?.dispose();
  }
  private remove(key: string): void {
    if (key === this.pinnedOpeningKey) return;
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.residentBytes -= entry.bytes;
  }
  private sweepExpired(): void {
    for (const [key, entry] of this.entries) {
      if (key !== this.pinnedOpeningKey && entry.expires <= this.now()) {
        this.remove(key);
        this.counts.evictions++;
      }
    }
  }
  private finiteTransport(): string {
    return this.config.backend === 'livekit-inference' ||
      this.config.backend === 'xai-plugin'
      ? 'websocket'
      : 'rest';
  }
  /** Two bounded background consumers; no session startup waits on this promise. */
  async prepare(lines: readonly string[]): Promise<void> {
    if (!this.enabled || this.shuttingDown || this.preparationStarted) return;
    this.preparationStarted = true;
    const queue = [...new Set(lines.filter((line) => line.trim()))];
    for (const text of queue) this.preparedTexts.add(text);
    const controller = new AbortController();
    const stop = () => {
      controller.abort();
      queue.length = 0;
      for (const phrase of this.preparations.values()) phrase.abort();
      this.preparations.clear();
    };
    this.preparationStop = stop;
    const untrack = this.track(stop);
    const totalTimer = setTimeout(stop, 30_000);
    totalTimer.unref?.();
    const consume = async () => {
      while (!controller.signal.aborted && queue.length) {
        const text = queue.shift()!;
        const key = this.identity(
          text,
          this.finiteTransport(),
          'finite-plain-v1',
        );
        const phrase = new AbortController();
        this.preparations.set(key, phrase);
        const timer = setTimeout(() => phrase.abort(), 10_000);
        timer.unref?.();
        let reader: ReadableStreamDefaultReader<AudioFrame> | undefined;
        try {
          reader = this.finiteAudio(text, {
            signal: phrase.signal,
            preparation: true,
          }).getReader();
          while (!phrase.signal.aborted && !(await reader.read()).done) {
            /* discard playback frames */
          }
        } catch {
          /* Preparation never fails the call. */
        } finally {
          clearTimeout(timer);
          if (this.preparations.get(key) === phrase)
            this.preparations.delete(key);
          void reader?.cancel().catch(() => {});
          reader?.releaseLock();
        }
      }
    };
    try {
      await Promise.all([consume(), consume()]);
    } finally {
      clearTimeout(totalTimer);
      stop();
      this.preparationStop = undefined;
      untrack();
    }
  }
  get stats() {
    return {
      ...this.counts,
      residentBytes: this.residentBytes,
      captureBytes: this.captureBytes,
      entries: this.entries.size,
      pending: this.pending.size,
      active: this.operations.size,
      preparing: this.preparations.size,
      bypassReasons: { ...this.bypassReasons },
      cacheWaitMs: this.cacheWait.snapshot(),
      segmentToFirstFrameMs: this.segmentToFirstFrame.snapshot(),
    };
  }
  bypass(reason: string): void {
    this.counts.bypasses++;
    this.bypassReasons[reason] = (this.bypassReasons[reason] ?? 0) + 1;
  }
  track(cancel: () => void): () => void {
    const operation = { cancel };
    if (this.disposed) cancel();
    else this.operations.add(operation);
    return () => {
      this.operations.delete(operation);
    };
  }
  identity(text: string, transport: string, transform: string): string {
    return ttsCacheIdentity(
      this.scope,
      this.config,
      {
        sampleRate: this.provider.sampleRate,
        numChannels: this.provider.numChannels,
      },
      transport,
      transform,
      text,
    );
  }
  private lookup(key: string): Entry | undefined {
    const hit = this.entries.get(key);
    if (!hit) return;
    if (key !== this.pinnedOpeningKey && hit.expires <= this.now()) {
      this.entries.delete(key);
      this.residentBytes -= hit.bytes;
      this.counts.evictions++;
      return;
    }
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit;
  }
  private publish(key: string, entry: Entry): Entry | undefined {
    const existing = this.lookup(key);
    if (existing) return existing;
    if (this.disposed || entry.bytes > this.policy.maxBytes) return;
    for (const [candidate, value] of this.entries) {
      if (candidate !== this.pinnedOpeningKey && value.expires <= this.now()) {
        this.entries.delete(candidate);
        this.residentBytes -= value.bytes;
        this.counts.evictions++;
      }
    }
    while (this.residentBytes + entry.bytes > this.policy.maxBytes) {
      const oldest = [...this.entries.entries()].find(([entryKey])=> entryKey !== this.pinnedOpeningKey,
      );
      if (!oldest) return;
      this.entries.delete(oldest[0]);
      this.residentBytes -= oldest[1].bytes;
      this.counts.evictions++;
    }
    this.entries.set(key, entry);
    this.residentBytes += entry.bytes;
    return entry;
  }
  private waitForFill(
    pending: Pending,
    signal: AbortSignal,
    timeoutMs = this.policy.dedupWaitMs,
  ): Promise<Entry | undefined> {
    this.counts.dedupWaits++;
    return new Promise((resolve) => {
      let finished = false;
      const finish = (entry?: Entry) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(entry);
      };
      const onAbort = () => finish();
      const timer = setTimeout(finish, Math.max(0, timeoutMs));
      signal.addEventListener('abort', onAbort, { once: true });
      void pending.promise.then(finish);
      if (signal.aborted) finish();
    });
  }

  /** Capture the same stream consumed by playback, never a second synthesis. */
  open(
    text: string,
    transport: string,
    transform: string,
    source: Source,
    options: {
      offset?: number;
      signal?: AbortSignal;
      cacheable?: boolean;
      preparation?: boolean;
      prepared?: boolean;
      releaseAfterPlayback?: boolean;
      lookupBudgetMs?: number;
    } = {},
  ): ReadableStream<AudioFrame> {
    let key: string | undefined;
    if (this.enabled && options.cacheable !== false) {
      try {
        key = this.identity(text, transport, transform);
      } catch {
        this.bypass('identity');
      }
    } else this.bypass(this.enabled ? 'unsupported' : 'disabled');
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<AudioFrame> | undefined;
    let iterator: Iterator<StoredFrame> | undefined;
    let pending: Pending | undefined;
    let captured: StoredFrame[] = [];
    let bytes = 0,
      seconds = 0;
    let complete = false,
      initialized = false,
      capturing = key !== undefined;
    let epoch = this.errorEpoch;
    const openedAt = performance.now();
    const started = openedAt / 1000;
    let firstFrame = true;
    const recordFirstFrame = () => {
      if (!firstFrame) return;
      firstFrame = false;
      this.segmentToFirstFrame.record(performance.now() - openedAt);
    };
    const offset = options.offset ?? 0;
    const releaseCapture = () => {
      this.captureBytes -= bytes;
      bytes = 0;
      captured = [];
    };
    const finishPending = (entry?: Entry) => {
      if (pending && key && this.pending.get(key) === pending) {
        this.pending.delete(key);
        pending.resolve(entry);
      }
      pending = undefined;
    };
    const stopCapture = (reason: string) => {
      if (!capturing) return;
      capturing = false;
      this.bypass(reason);
      releaseCapture();
      finishPending();
    };
    const operation: Operation = {
      cancel: () => {
        if (complete || controller.signal.aborted) return;
        controller.abort();
        this.counts.abortedCaptures++;
        releaseCapture();
        iterator = undefined;
        if (key && options.releaseAfterPlayback) this.remove(key);
        finishPending();
        this.operations.delete(operation);
        options.signal?.removeEventListener('abort', onAbort);
        void reader?.cancel().catch(() => {});
      },
    };
    const onAbort = () => operation.cancel();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    this.operations.add(operation);
    if (options.signal?.aborted || this.disposed) operation.cancel();
    const cleanup = () => {
      releaseCapture();
      finishPending();
      this.operations.delete(operation);
      options.signal?.removeEventListener('abort', onAbort);
      reader?.releaseLock();
      iterator = undefined;
      reader = undefined;
      if (key && !options.preparation && key === this.pinnedOpeningKey)
        this.pinnedOpeningKey = undefined;
      if (key && options.releaseAfterPlayback) this.remove(key);
      complete = true;
    };
    const initialize = async () => {
      initialized = true;
      if (controller.signal.aborted) return;
      if (key) {
        const lookupStarted = performance.now();
        try {
          const deadline =
            performance.now() +
            (options.lookupBudgetMs ??
              Math.min(this.policy.dedupWaitMs, TTS_CACHE_LIMITS.lookupMs));
          let hit = this.lookup(key);
          const filling = this.pending.get(key);
          if (!hit && filling) {
            const result = await this.waitForFill(
              filling,
              controller.signal,
              deadline - performance.now(),
            );
            hit =
              result && result.expires > this.now() ? result : this.lookup(key);
          }
          if (controller.signal.aborted) return;
          // A foreground source takes priority; a background consumer never duplicates it.
          if (!hit && filling && options.preparation) return;
          if (!hit && !options.preparation) this.preparations.get(key)?.abort();
          if (!hit && !this.pending.has(key)) {
            let resolve!: Pending['resolve'];
            const promise = new Promise<Entry | undefined>((done) => {
              resolve = done;
            });
            pending = { promise, resolve };
            this.pending.set(key, pending);
          }
          if (!hit && this.shared && performance.now() < deadline) {
            const imported = await this.shared.lookup(
              key,
              deadline,
              controller.signal,
              options.prepared ? 'prepared' : 'automatic',
            );
            if (controller.signal.aborted) return;
            if (
              imported &&
              performance.now() < deadline &&
              imported.expires > this.now() &&
              imported.bytes <= this.policy.maxEntryBytes &&
              imported.frames.reduce(
                (n, f) => n + f.samplesPerChannel / f.sampleRate,
                0,
              ) <= this.policy.maxEntrySeconds &&
              imported.frames.every(
                (f) =>
                  f.sampleRate === this.provider.sampleRate &&
                  f.channels === this.provider.numChannels,
              )
            ) {
              imported.expires = Math.min(
                imported.expires,
                this.now() + this.policy.ttlMs,
              );
              hit = this.publish(key, imported);
              if (hit) this.counts.sharedHits++;
            }
          }
          if (hit) {
            finishPending(hit);
            this.counts.hits++;
            iterator = hit.frames[Symbol.iterator]();
            capturing = false;
            return;
          }
          this.counts.misses++;
        } catch {
          stopCapture('lookup-error');
        } finally {
          this.cacheWait.record(performance.now() - lookupStarted);
        }
      }
      epoch = this.errorEpoch;
      this.counts.synthesisInvocations++;
      const live = await source(controller.signal);
      if (live) {
        reader = live.getReader();
        if (controller.signal.aborted) await reader.cancel();
      }
    };
    return new ReadableStream<AudioFrame>(
      {
        pull: async (output) => {
          try {
            if (!initialized) await initialize();
            if (controller.signal.aborted)
              throw new DOMException(
                'TTS cache operation aborted',
                'AbortError',
              );
            if (iterator) {
              const next = iterator.next();
              if (next.done) {
                cleanup();
                output.close();
              } else {
                const frame = freshFrame(next.value, offset, started);
                recordFirstFrame();
                output.enqueue(frame);
              }
              return;
            }
            const next = reader
              ? await reader.read()
              : { done: true as const, value: undefined };
            if (controller.signal.aborted)
              throw new DOMException(
                'TTS cache operation aborted',
                'AbortError',
              );
            if (next.done) {
              if (capturing && epoch !== this.errorEpoch)
                stopCapture('provider-error');
              if (
                capturing &&
                epoch === this.errorEpoch &&
                captured.length &&
                key
              ) {
                try {
                  const entry = {
                    frames: captured,
                    bytes,
                    expires: this.now() + this.policy.ttlMs,
                  };
                  const published = this.publish(key, entry);
                  finishPending(published);
                  if (published === entry)
                    this.shared?.publish(
                      key,
                      entry,
                      options.prepared ? 'prepared' : 'automatic',
                    );
                } catch {
                  this.counts.writeFailures++;
                }
              }
              cleanup();
              output.close();
              return;
            }
            const frame = next.value;
            recordFirstFrame();
            if (capturing && epoch !== this.errorEpoch)
              stopCapture('provider-error');
            if (capturing) {
              try {
                if (
                  frame.sampleRate !== this.provider.sampleRate ||
                  frame.channels !== this.provider.numChannels
                )
                  stopCapture('format');
                else {
                  const copy = storedFrame(frame);
                  const size =
                    copy.data.byteLength +
                    Buffer.byteLength(JSON.stringify(copy.timings)) +
                    64;
                  seconds += frame.samplesPerChannel / frame.sampleRate;
                  if (
                    bytes + size > this.policy.maxEntryBytes ||
                    seconds > this.policy.maxEntrySeconds
                  )
                    stopCapture('entry-limit');
                  else if (
                    this.captureBytes + size >
                    this.policy.maxCaptureBytes
                  )
                    stopCapture('capture-limit');
                  else {
                    captured.push({ ...copy, data: copy.data.slice() });
                    bytes += size;
                    this.captureBytes += size;
                  }
                }
              } catch {
                stopCapture('capture-error');
              }
            }
            if (options.preparation && !capturing) {
              throw new Error('Preparation capture unavailable');
            }
            if (offset) {
              const timings = frame.userdata[TIMED] as Timing[] | undefined;
              output.enqueue(
                new AudioFrame(
                  frame.data,
                  frame.sampleRate,
                  frame.channels,
                  frame.samplesPerChannel,
                  {
                    ...frame.userdata,
                    ...(timings ? { [TIMED]: rebase(timings, offset) } : {}),
                  },
                ),
              );
            } else output.enqueue(frame);
          } catch (error) {
            operation.cancel();
            cleanup();
            output.error(error);
          }
        },
        cancel: async () => {
          operation.cancel();
          try {
            await reader?.cancel();
          } finally {
            cleanup();
          }
        },
      },
      { highWaterMark: 0 },
    );
  }

  finiteAudio(
    text: string,
    options: { signal?: AbortSignal; preparation?: boolean ;
      lookupBudgetMs?: number;
    } = {},
  ): ReadableStream<AudioFrame> {
    return this.open(
      text,
      this.finiteTransport(),
      'finite-plain-v1',
      (signal) => {
        const iterator = this.finiteSynthesizer
          .synthesize(text, signal)
          [Symbol.asyncIterator]();
        return new ReadableStream<AudioFrame>(
          {
            async pull(output) {
              try {
                const next = await iterator.next();
                if (next.done) output.close();
                else if (next.value.frame) output.enqueue(next.value.frame);
              } catch (error) {
                output.error(error);
              }
            },
            async cancel() {
              await iterator.return?.();
            },
          },
          { highWaterMark: 0 },
        );
      },
      {
        ...options,
        prepared: this.preparedTexts.has(text),
        releaseAfterPlayback: !options.preparation && !this.automaticEnabled,
      },
    );
  }
  /** Strict pre-dial fill: unlike background preparation, failure blocks dialing. */
  async prepareOpening(text: string, signal: AbortSignal): Promise<void> {
    this.registerPreparedTexts([text]);
    const reader = this.finiteAudio(text, {
      signal,
      preparation: true,
      lookupBudgetMs: 1000,
    }).getReader();
    try {
      while (!(await reader.read()).done) {
        /* retain only complete captured audio */
      }
      const key = this.identity(
        text,
        this.finiteTransport(),
        'finite-plain-v1',
      );
      const entry = this.lookup(key);
      if (
        signal.aborted ||
        !this.enabled ||
        !entry?.frames.length ||
        entry.frames.length > TTS_CACHE_LIMITS.maxFrames ||
        !entry.frames.every(
          (frame) =>
            frame.samplesPerChannel > 0 &&
            frame.data.length === frame.samplesPerChannel * frame.channels,
        )
      )
        throw new Error('Opening preparation unavailable');
      this.pinnedOpeningKey = key;
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.expiryTimer);
    this.shared?.dispose();
    for (const operation of this.operations) operation.cancel();
    this.operations.clear();
    for (const pending of this.pending.values()) pending.resolve();
    this.pending.clear();
    this.preparations.clear();
    this.preparedTexts.clear();
    console.log('[agent] tts-cache ' + JSON.stringify(this.stats));
    this.entries.clear();
    this.pinnedOpeningKey = undefined;
    this.residentBytes = 0;
    this.provider.off('error', this.onError);
  }
}
