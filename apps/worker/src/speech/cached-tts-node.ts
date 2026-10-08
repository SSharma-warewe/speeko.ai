import { ReadableStream } from 'node:stream/web';
import { AudioFrame } from '@livekit/rtc-node';
import { voice, tts, tokenize } from '@livekit/agents';
import type { TtsCacheRuntime } from './tts-cache-runtime.js';

type Hook<UserData> = NonNullable<voice.AgentHooks<UserData>['ttsNode']>;
const TIMED = 'lk.timed_transcripts';

function textStream(
  text: AsyncIterable<string>,
  signal: AbortSignal,
): ReadableStream<string> {
  const iterator = text[Symbol.asyncIterator]();
  return new ReadableStream<string>(
    {
      async pull(output) {
        if (signal.aborted) {
          output.close();
          return;
        }
        const next = await iterator.next();
        if (next.done) output.close();
        else output.enqueue(next.value);
      },
      cancel() {
        void iterator.return?.().catch(() => {});
      },
    },
    { highWaterMark: 0 },
  );
}

/** SDK sentence boundaries, with native word streaming explicitly bypassed. */
export function createCachedTtsNode<UserData = unknown>(
  cache: TtsCacheRuntime,
): Hook<UserData> {
  return (ctx, text, settings) => {
    const controller = new AbortController();
    const input = textStream(text, controller.signal);
    const readers = new Set<ReadableStreamDefaultReader<AudioFrame>>();
    let inputReader: ReadableStreamDefaultReader<string> | undefined;
    let sentenceStream: tokenize.SentenceStream | undefined;
    const cancel = () => {
      controller.abort();
      sentenceStream?.close();
      if (!input.locked) void input.cancel().catch(() => {});
      void inputReader?.cancel().catch(() => {});
      for (const reader of readers) void reader.cancel().catch(() => {});
    };
    const untrack = cache.track(cancel);
    const iterator = (async function* () {
      let pump: Promise<void> | undefined;
      let pumpError: unknown;
      try {
        const expressive = ctx.agent.expressive ?? ctx.session._expressive;
        const reason = !cache.enabled
          ? 'disabled'
          : ctx.tts !== cache.provider
            ? 'provider-mismatch'
            : cache.config.backend === 'xai-plugin'
              ? 'word-streaming'
              : expressive
                ? 'expressive'
                : undefined;
        if (reason) {
          cache.bypass(reason);
          const stream = await voice.Agent.default.ttsNode(
            ctx.agent,
            input,
            settings,
          );
          if (!stream) return;
          const reader = stream.getReader();
          readers.add(reader);
          try {
            while (!controller.signal.aborted) {
              const next = await reader.read();
              if (next.done) break;
              yield next.value;
            }
          } finally {
            await reader.cancel();
            readers.delete(reader);
            reader.releaseLock();
          }
          return;
        }
        const config = cache.config;
        const tokenizer =
          config.backend === 'livekit-inference'
            ? tts.sentenceTokenizer(config.runtimeModel.split('/')[0]!, {
                expressive: false,
              })
            : new tokenize.basic.SentenceTokenizer({
                minSentenceLength:
                  config.backend === 'sarvam-plugin' && config.streaming
                    ? 8
                    : 20,
              });
        sentenceStream = tokenizer.stream();
        inputReader = input.getReader();
        const sentences = sentenceStream;
        pump = (async () => {
          try {
            while (!controller.signal.aborted) {
              const next = await inputReader!.read();
              if (next.done) break;
              sentences.pushText(next.value);
            }
            if (!controller.signal.aborted) sentences.endInput();
          } catch (error) {
            pumpError = error;
            sentences.close();
          }
        })();
        type Segment = {
          reader: ReadableStreamDefaultReader<AudioFrame>;
          first: Promise<ReadableStreamReadResult<AudioFrame>>;
        };
        const nextSegment = async (): Promise<Segment | undefined> => {
          const next = await sentences.next();
          if (pumpError) throw pumpError;
          if (next.done || controller.signal.aborted) return;
          const segment = next.value.token;
          const audio = cache.open(
            segment,
            config.streaming ? 'websocket' : 'rest',
            'sdk-plain-segment-v1',
            async (signal) => {
              const stream = await voice.Agent.default.ttsNode(
                ctx.agent,
                new ReadableStream<string>({
                  start(output) {
                    output.enqueue(segment);
                    output.close();
                  },
                }),
                settings,
              );
              // Cancellation can happen while a provider/node is being constructed.
              if (stream && signal.aborted) {
                await stream.cancel();
                return null;
              }
              return stream;
            },
            { signal: controller.signal },
          );
          const reader = audio.getReader();
          readers.add(reader);
          const first = reader.read();
          // A prefetched segment can fail before its ordered playback begins.
          void first.catch(() => {});
          return { reader, first };
        };
        let current = await nextSegment();
        let offset = 0;
        while (current && !controller.signal.aborted) {
          // At most the current segment and one lookahead synthesis.
          const following = nextSegment();
          void following.catch(() => {});
          let next = await current.first;
          let duration = 0;
          try {
            while (!next.done && !controller.signal.aborted) {
              const frame = next.value;
              const timings = frame.userdata[TIMED] as
                voice.TimedString[] | undefined;
              yield offset && timings?.length
                ? new AudioFrame(
                    frame.data,
                    frame.sampleRate,
                    frame.channels,
                    frame.samplesPerChannel,
                    {
                      ...frame.userdata,
                      [TIMED]: timings.map((timing) =>
                        voice.createTimedString({
                          ...timing,
                          startTime:
                            timing.startTime === undefined
                              ? undefined
                              : timing.startTime + offset,
                          endTime:
                            timing.endTime === undefined
                              ? undefined
                              : timing.endTime + offset,
                        }),
                      ),
                    },
                  )
                : frame;
              duration += frame.samplesPerChannel / frame.sampleRate;
              next = await current.reader.read();
            }
          } finally {
            await current.reader.cancel();
            readers.delete(current.reader);
            current.reader.releaseLock();
          }
          offset += duration;
          current = await following;
        }
        await pump;
        if (pumpError) throw pumpError;
      } finally {
        cancel();
        await pump;
        inputReader?.releaseLock();
        untrack();
      }
    })();
    // SDK toStream invokes return() during interruption; cancel before awaiting
    // generator cleanup so an outstanding provider read cannot deadlock it.
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      next() {
        return iterator.next();
      },
      return() {
        cancel();
        // An async generator returned before its first next() never enters finally.
        untrack();
        return iterator.return();
      },
    };
  };
}
