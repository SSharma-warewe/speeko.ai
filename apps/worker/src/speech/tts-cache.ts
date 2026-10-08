import type { AudioFrame } from '@livekit/rtc-node';
import type { ReadableStream } from 'node:stream/web';
import type { TtsCacheRuntime } from './tts-cache-runtime.js';

export type CachedAudioFrame = AudioFrame;
export type TtsSynthesizer = {
  synthesize(
    text: string,
    signal?: AbortSignal,
  ): AsyncIterable<{ frame?: AudioFrame }>;
};
export type CachedSayOptions = {
  addToChatCtx?: boolean;
  allowInterruptions?: boolean;
};
export type CachedSaySession = {
  say: (
    text: string,
    options?: CachedSayOptions & { audio?: ReadableStream<AudioFrame> },
  ) => unknown;
};

/** The audio source streams one synthesis on a miss; no background fill. */
export function sayCached(
  session: CachedSaySession,
  cache: TtsCacheRuntime | undefined,
  text: string,
  options: CachedSayOptions,
): unknown {
  return session.say(
    text,
    cache?.enabled ? { ...options, audio: cache.finiteAudio(text) } : options,
  );
}
