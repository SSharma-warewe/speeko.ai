import { isRealtimeLlmModel } from './llm.js';

/** Portable, bounded speech clips. No SDK objects or application I/O. */
export const TTS_CACHE_REVISION = 1 as const;
export const TTS_CACHE_NAMESPACE = 'shared-v1-livekit-1.7.1';
export const TTS_CACHE_LIMITS = {
  maxBytes: 1024 * 1024,
  maxWireBytes: 1536 * 1024,
  maxFrames: 2048,
  maxSeconds: 15,
  ttlMs: 24 * 60 * 60 * 1000,
  lookupMs: 25,
} as const;
export type TtsCacheTiming = {
  text: string;
  startTime?: number;
  endTime?: number;
  confidence?: number;
  startTimeOffset?: number;
  speakerId?: string | null;
};
export type TtsCacheFrame = {
  samplesPerChannel: number;
  timings: TtsCacheTiming[];
};
export type TtsCacheMetadata = {
  revision: typeof TTS_CACHE_REVISION;
  format: 'pcm-s16le';
  sampleRate: number;
  channels: number;
  durationSeconds: number;
  frames: TtsCacheFrame[];
};
export type TtsCacheEnvelope = TtsCacheMetadata & {
  pcmBase64: string;
  checksum: string;
};
export type TtsCacheLookupRequest = {
  roomName: string;
  digest: string;
  namespace: typeof TTS_CACHE_NAMESPACE;
};
export type TtsCachePublishRequest = TtsCacheLookupRequest & {
  envelope: TtsCacheEnvelope;
};
export type TtsCacheLookupResponse =
  { hit: false } | { hit: true; envelope: TtsCacheEnvelope; expiresAt: string };
export type TtsCachePublishResponse = {
  result: 'stored' | 'already_present' | 'skipped';
};

const fail = (): never => {
  throw new Error('Invalid TTS cache envelope');
};
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((k) => !keys.includes(k))) return fail();
  return record;
}

/** Validate bounds and return canonical metadata for checksumming/storage. */
export function ttsCacheMetadata(value: unknown): {
  metadata: TtsCacheMetadata;
  pcmBytes: number;
} {
  const e = object(value, [
    'revision',
    'format',
    'sampleRate',
    'channels',
    'durationSeconds',
    'frames',
    'pcmBase64',
    'checksum',
  ]);
  if (
    e.revision !== TTS_CACHE_REVISION ||
    e.format !== 'pcm-s16le' ||
    !Number.isInteger(e.sampleRate) ||
    (e.sampleRate as number) < 8000 ||
    (e.sampleRate as number) > 96000 ||
    ![1, 2].includes(e.channels as number) ||
    !Array.isArray(e.frames) ||
    !e.frames.length ||
    e.frames.length > TTS_CACHE_LIMITS.maxFrames ||
    typeof e.pcmBase64 !== 'string' ||
    !e.pcmBase64.length ||
    e.pcmBase64.length > Math.ceil(TTS_CACHE_LIMITS.maxBytes / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      e.pcmBase64,
    ) ||
    typeof e.checksum !== 'string' ||
    !/^[a-f0-9]{64}$/.test(e.checksum)
  )
    return fail();
  let samples = 0;
  const frames = e.frames.map((value) => {
    const f = object(value, ['samplesPerChannel', 'timings']);
    if (
      !Number.isInteger(f.samplesPerChannel) ||
      (f.samplesPerChannel as number) <= 0 ||
      (f.samplesPerChannel as number) > 96000 * 15 ||
      !Array.isArray(f.timings) ||
      f.timings.length > 1024
    )
      return fail();
    samples += f.samplesPerChannel as number;
    const timings = f.timings.map((value) => {
      const t = object(value, [
        'text',
        'startTime',
        'endTime',
        'confidence',
        'startTimeOffset',
        'speakerId',
      ]);
      if (
        typeof t.text !== 'string' ||
        t.text.length > 8192 ||
        (t.speakerId !== undefined &&
          t.speakerId !== null &&
          (typeof t.speakerId !== 'string' || t.speakerId.length > 128))
      )
        return fail();
      for (const k of [
        'startTime',
        'endTime',
        'confidence',
        'startTimeOffset',
      ]) {
        if (
          t[k] !== undefined &&
          (typeof t[k] !== 'number' ||
            !Number.isFinite(t[k]) ||
            Math.abs(t[k] as number) > 86400)
        )
          return fail();
      }
      if (
        t.startTime !== undefined &&
        t.endTime !== undefined &&
        (t.endTime as number) < (t.startTime as number)
      )
        return fail();
      return {
        text: t.text,
        startTime: t.startTime,
        endTime: t.endTime,
        confidence: t.confidence,
        startTimeOffset: t.startTimeOffset,
        speakerId: t.speakerId,
      } as TtsCacheTiming;
    });
    return { samplesPerChannel: f.samplesPerChannel as number, timings };
  });
  const duration = samples / (e.sampleRate as number);
  const pcmBytes =
    (e.pcmBase64.length / 4) * 3 -
    (e.pcmBase64.endsWith('==') ? 2 : e.pcmBase64.endsWith('=') ? 1 : 0);
  if (
    duration > TTS_CACHE_LIMITS.maxSeconds ||
    typeof e.durationSeconds !== 'number' ||
    !Number.isFinite(e.durationSeconds) ||
    Math.abs(duration - e.durationSeconds) > 1e-9 ||
    pcmBytes !== samples * (e.channels as number) * 2
  )
    return fail();
  return {
    metadata: {
      revision: TTS_CACHE_REVISION,
      format: 'pcm-s16le',
      sampleRate: e.sampleRate as number,
      channels: e.channels as number,
      durationSeconds: duration,
      frames,
    },
    pcmBytes,
  };
}
/** Null inherits the supplied default; native speech-to-speech never caches. */
export function resolveTtsCacheEnabled(
  preference: boolean | null | undefined,
  defaultEnabled = false,
  model?: string | null,
): boolean {
  return !isRealtimeLlmModel(model) && (preference ?? defaultEnabled) === true;
}
