import {
  TTS_CACHE_LIMITS,
  TTS_CACHE_NAMESPACE,
  type TtsCacheLookupResponse,
} from '@call-agent/contracts';
import { resolveWorkerApiConfig } from '../common/env.js';
import {
  decodeCacheEntry,
  encodeCacheEntry,
  type TtsCacheEntry,
} from './tts-cache-envelope.js';

export interface TtsSharedCache {
  lookup(
    digest: string,
    deadline: number,
    signal: AbortSignal,
    purpose?: 'automatic' | 'prepared',
  ): Promise<TtsCacheEntry | undefined>;
  publish(
    digest: string,
    entry: TtsCacheEntry,
    purpose?: 'automatic' | 'prepared',
  ): void;
  dispose(): void;
}
type Deps = { fetch?: typeof fetch; now?: () => number };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** Best-effort HTTP only. No callback retries, text logging or shutdown drain. */
export class TtsSharedCacheClient implements TtsSharedCache {
  private disposed = false;
  private denied = false;
  private readonly deniedPurposes = new Set<'automatic' | 'prepared'>();
  private failures = 0;
  private blockedUntil = 0;
  private readonly controllers = new Set<AbortController>();
  private readonly queue: Array<{
    digest: string;
    entry: TtsCacheEntry;
    reserved: number;
    purpose: 'automatic' | 'prepared';
  }> = [];
  private activeUploads = 0;
  private queuedBytes = 0;
  readonly stats = {
    hits: 0,
    misses: 0,
    failures: 0,
    timeouts: 0,
    corrupt: 0,
    dropped: 0,
    publications: 0,
    lookupMs: 0,
  };
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
    private readonly callId: string,
    private readonly roomName: string,
    private readonly deps: Deps = {},
  ) {}
  static create(
    callId: string | undefined,
    organizationId: string | undefined,
    roomName: string | undefined,
    env: NodeJS.ProcessEnv = process.env,
  ): TtsSharedCacheClient | undefined {
    const api = resolveWorkerApiConfig(env);
    if (
      env.TTS_SHARED_CACHE_ENABLED !== 'true' ||
      !api ||
      !callId ||
      !UUID.test(callId) ||
      !organizationId ||
      !UUID.test(organizationId) ||
      !roomName ||
      roomName === 'unknown' ||
      roomName.length > 255
    )
      return;
    return new TtsSharedCacheClient(api.baseUrl, api.secret, callId, roomName);
  }
  private available(purpose?: 'automatic' | 'prepared') {
    return (
      !this.disposed &&
      !this.denied &&
      (!purpose || !this.deniedPurposes.has(purpose)) &&
      this.blockedUntil <= (this.deps.now ?? Date.now)()
    );
  }
  private failure() {
    this.stats.failures++;
    if (++this.failures >= 3) {
      this.blockedUntil = (this.deps.now ?? Date.now)() + 10_000;
      this.failures = 0;
    }
  }
  private async request(
    kind: 'lookup' | 'publish',
    digest: string,
    extra: object,
    timeout: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const purpose =
      (extra as { purpose?: 'automatic' | 'prepared' }).purpose ?? 'automatic';
    if (!this.available(purpose) || timeout <= 0 || signal?.aborted) return;
    const controller = new AbortController();
    this.controllers.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let aborted = false;
    const onAbort = () => {
      aborted = true;
      controller.abort();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      // Race explicitly: injected/stalled transports may ignore abort.
      const work = (async () => {
        const response = await (this.deps.fetch ?? fetch)(
          `${this.baseUrl}/api/internal/calls/${this.callId}/tts-cache/${kind}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Worker-Secret': this.secret,
            },
            body: JSON.stringify({
              roomName: this.roomName,
              digest,
              namespace: TTS_CACHE_NAMESPACE,
              ...extra,
            }),
            signal: controller.signal,
          },
        );
        if (controller.signal.aborted) {
          void response.body?.cancel().catch(() => {});
          return;
        }
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          if ([401, 404].includes(response.status)) this.denied = true;
          else if (response.status === 403) this.deniedPurposes.add(purpose);
          else if (
            response.status >= 500 ||
            response.status === 408 ||
            response.status === 429
          )
            this.failure();
          return;
        }
        if (
          Number(response.headers.get('content-length')) >
          TTS_CACHE_LIMITS.maxWireBytes
        ) {
          void response.body?.cancel().catch(() => {});
          throw new Error('Invalid cache response');
        }
        const reader = response.body?.getReader();
        if (!reader) return;
        const cancelReader = () => {
          void reader.cancel().catch(() => {});
        };
        controller.signal.addEventListener('abort', cancelReader, {
          once: true,
        });
        if (controller.signal.aborted) cancelReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          while (!controller.signal.aborted) {
            const next = await reader.read();
            if (next.done) break;
            bytes += next.value.byteLength;
            if (bytes > TTS_CACHE_LIMITS.maxWireBytes)
              throw new Error('Invalid cache response');
            chunks.push(next.value);
          }
          if (controller.signal.aborted) return;
          const result: unknown = JSON.parse(
            Buffer.concat(chunks).toString('utf8'),
          );
          this.failures = 0;
          return result;
        } finally {
          controller.signal.removeEventListener('abort', cancelReader);
          if (
            controller.signal.aborted ||
            bytes > TTS_CACHE_LIMITS.maxWireBytes
          )
            void reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      })();
      const stopped = new Promise<undefined>((resolve) => {
        controller.signal.addEventListener('abort', () => resolve(undefined), {
          once: true,
        });
        timer = setTimeout(() => {
          this.stats.timeouts++;
          if (!aborted && !this.disposed) this.failure();
          controller.abort();
        }, timeout);
      });
      return await Promise.race([work, stopped]);
    } catch {
      if (!controller.signal.aborted) this.failure();
      return;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      this.controllers.delete(controller);
    }
  }
  async lookup(
    digest: string,
    deadline: number,
    signal: AbortSignal,
    purpose: 'automatic' | 'prepared' = 'automatic',
  ) {
    const start = performance.now();
    if (!this.available(purpose)) return;
    const result = (await this.request(
      'lookup',
      digest,
      { purpose },
      deadline - start,
      signal,
    )) as TtsCacheLookupResponse | undefined;
    try {
      if (
        signal.aborted ||
        performance.now() >= deadline ||
        !result ||
        result.hit !== true
      ) {
        this.stats.misses++;
        return;
      }
      const expires = Date.parse(result.expiresAt);
      const now = (this.deps.now ?? Date.now)();
      if (
        !Number.isFinite(expires) ||
        expires <= now ||
        expires > now + TTS_CACHE_LIMITS.ttlMs + 5000
      )
        throw new Error('Invalid cache expiry');
      const entry = decodeCacheEntry(result.envelope, expires);
      if (signal.aborted || performance.now() >= deadline) {
        this.stats.misses++;
        return;
      }
      this.stats.hits++;
      return entry;
    } catch {
      this.stats.corrupt++;
      this.stats.misses++;
      return;
    } finally {
      this.stats.lookupMs += performance.now() - start;
    }
  }
  publish(
    digest: string,
    entry: TtsCacheEntry,
    purpose: 'automatic' | 'prepared' = 'automatic',
  ) {
    if (!this.available(purpose)) return;
    const reserved = Math.ceil((entry.bytes * 4) / 3) + 1024;
    if (
      reserved > TTS_CACHE_LIMITS.maxWireBytes ||
      this.queuedBytes + reserved > 4 * 1024 * 1024
    ) {
      this.stats.dropped++;
      return;
    }
    this.queuedBytes += reserved;
    this.queue.push({ digest, entry, reserved, purpose });
    setImmediate(() => this.pump());
  }
  private pump() {
    if (!this.available()) {
      this.clearQueue();
      return;
    }
    while (this.activeUploads < 2 && this.queue.length) {
      const job = this.queue.shift()!;
      if (!this.available(job.purpose)) {
        this.queuedBytes -= job.reserved;
        continue;
      }
      this.activeUploads++;
      void (async () => {
        try {
          const envelope = encodeCacheEntry(job.entry);
          const result = (await this.request(
            'publish',
            job.digest,
            { envelope, purpose: job.purpose },
            1000,
          )) as { result?: string } | undefined;
          if (
            result?.result === 'stored' ||
            result?.result === 'already_present'
          )
            this.stats.publications++;
        } catch {
          this.stats.dropped++;
        } finally {
          this.activeUploads--;
          this.queuedBytes -= job.reserved;
          this.pump();
        }
      })();
    }
  }
  get pendingBytes() {
    return this.queuedBytes;
  }
  private clearQueue() {
    for (const job of this.queue.splice(0)) this.queuedBytes -= job.reserved;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clearQueue();
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    console.log('[agent] tts-shared-cache ' + JSON.stringify(this.stats));
  }
}
