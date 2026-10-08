import type { tts } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import type { TtsSynthesizer } from './tts-cache.js';

export type TtsCacheSynthesisMode = 'stream' | 'chunked';

/** Adapt finite cache phrases without changing the session's TTS provider. */
export function createTtsCacheSynthesizer(
  provider: tts.TTS,
  mode: TtsCacheSynthesisMode,
): TtsSynthesizer {
  const captures = new Set<{ error?: Error }>();
  // SDK failures can emit an error and end iteration normally. Error events
  // have no stream id, so conservatively discard all concurrent captures.
  // Share one listener across parallel phrases to avoid listener-limit warnings.
  const onError = (event: { error: Error; recoverable: boolean }): void => {
    if (!event.recoverable) {
      for (const capture of captures) capture.error = event.error;
    }
  };

  return {
    async *synthesize(text, signal) {
      const capture: { error?: Error } = {};
      if (captures.size === 0) provider.on('error', onError);
      captures.add(capture);
      let stream: tts.SynthesizeStream | tts.ChunkedStream | undefined;
      const onAbort = () => stream?.close();
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        if (signal?.aborted)
          throw new DOMException('TTS synthesis aborted', 'AbortError');
        if (mode === 'stream') {
          const streaming = provider.stream();
          stream = streaming;
          streaming.updateInputStream(
            new ReadableStream<string>({
              start(controller) {
                controller.enqueue(text);
                controller.close();
              },
            }),
          );
        } else {
          stream = provider.synthesize(text, undefined, signal);
        }

        for await (const event of stream) {
          if (capture.error) throw capture.error;
          // Streaming includes END_OF_STREAM symbols between audio segments.
          if (typeof event === 'object' && event.frame !== undefined) {
            yield event;
          }
        }
        if (capture.error) throw capture.error;
        if (stream.abortSignal.aborted) {
          throw new Error('TTS cache synthesis was aborted');
        }
      } finally {
        try {
          stream?.close();
        } finally {
          captures.delete(capture);
          signal?.removeEventListener('abort', onAbort);
          if (captures.size === 0) provider.off('error', onError);
        }
      }
    },
  };
}
