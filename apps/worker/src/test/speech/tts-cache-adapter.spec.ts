import { EventEmitter } from 'node:events';
import type { tts } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { createTtsCacheSynthesizer } from '../../speech/tts-cache-adapter';

function fixture(events: () => AsyncIterable<unknown>) {
  const emitter = new EventEmitter();
  const controller = new AbortController();
  let input: ReadableStream<string> | undefined;
  const received: string[] = [];
  const stream = {
    abortSignal: controller.signal,
    close: jest.fn(() => controller.abort()),
    updateInputStream: jest.fn((source: ReadableStream<string>) => {
      input = source;
    }),
    async *[Symbol.asyncIterator]() {
      if (input) for await (const text of input) received.push(text);
      yield* events();
    },
  };
  const synthesize = jest.fn(() => stream);
  const openStream = jest.fn(() => stream);
  const close = jest.fn();
  const provider = Object.assign(emitter, {
    synthesize,
    stream: openStream,
    close,
  }) as unknown as tts.TTS;
  return {
    provider,
    emitter,
    controller,
    stream,
    received,
    synthesize,
    openStream,
    close,
  };
}
const frame = new AudioFrame(new Int16Array([1]), 24000, 1, 1);
async function collect(provider: tts.TTS, mode: 'stream' | 'chunked') {
  const frames = [];
  for await (const event of createTtsCacheSynthesizer(
    provider,
    mode,
  ).synthesize('  जी।\nअगला सवाल?  '))
    frames.push(event.frame);
  return frames;
}
describe('finite cache synthesis adapter', () => {
  it('streams exact finite input, skips sentinels and keeps frame order', async () => {
    const f = fixture(async function* () {
      yield { frame };
      yield Symbol('END');
      yield { frame };
    });
    f.synthesize.mockImplementation(() => {
      throw new Error('ChunkedStream is not implemented');
    });
    expect(await collect(f.provider, 'stream')).toEqual([frame, frame]);
    expect(f.received).toEqual(['  जी।\nअगला सवाल?  ']);
    expect(f.synthesize).not.toHaveBeenCalled();
    expect(f.stream.close).toHaveBeenCalledTimes(1);
    expect(f.close).not.toHaveBeenCalled();
    expect(f.emitter.listenerCount('error')).toBe(0);
  });
  it.each(['stream', 'chunked'] as const)(
    'closes %s after an iterator failure',
    async (mode) => {
      const f = fixture(async function* () {
        yield { frame };
        throw new Error('failed');
      });
      await expect(collect(f.provider, mode)).rejects.toThrow('failed');
      expect(f.stream.close).toHaveBeenCalledTimes(1);
      expect(f.emitter.listenerCount('error')).toBe(0);
    },
  );
  it.each(['stream', 'chunked'] as const)(
    'rejects normally ended SDK error output in %s mode',
    async (mode) => {
      const f = fixture(async function* () {
        yield { frame };
        f.emitter.emit('error', {
          error: new Error('SDK failure'),
          recoverable: false,
        });
      });
      await expect(collect(f.provider, mode)).rejects.toThrow('SDK failure');
      expect(f.stream.close).toHaveBeenCalledTimes(1);
      expect(f.emitter.listenerCount('error')).toBe(0);
    },
  );
  it('cleans up when assigning input fails', async () => {
    const f = fixture(async function* () {});
    f.stream.updateInputStream.mockImplementation(() => {
      throw new Error('input failure');
    });
    await expect(collect(f.provider, 'stream')).rejects.toThrow(
      'input failure',
    );
    expect(f.stream.close).toHaveBeenCalledTimes(1);
    expect(f.emitter.listenerCount('error')).toBe(0);
  });
  it('retains chunked synthesis and the provider method receiver', async () => {
    const f = fixture(async function* () {
      yield { frame };
    });
    f.synthesize.mockImplementation(function (this: tts.TTS) {
      expect(this).toBe(f.provider);
      return f.stream;
    });
    await collect(f.provider, 'chunked');
    expect(f.openStream).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
  });
  it('closes a stalled provider read on external abort before generator cleanup', async () => {
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const f = fixture(async function* () {
      yield { frame };
      await waiting;
    });
    f.stream.close.mockImplementation(() => {
      f.controller.abort();
      finish();
    });
    const controller = new AbortController();
    const iterator = createTtsCacheSynthesizer(f.provider, 'stream')
      .synthesize('Hello', controller.signal)
      [Symbol.asyncIterator]();
    await iterator.next();
    const pending = iterator.next();
    controller.abort();
    await expect(pending).rejects.toThrow('aborted');
    expect(f.close).not.toHaveBeenCalled();
    expect(f.emitter.listenerCount('error')).toBe(0);
  });
  it('does not construct a provider stream for a pre-aborted request', async () => {
    const f = fixture(async function* () {});
    const controller = new AbortController();
    controller.abort();
    const iterator = createTtsCacheSynthesizer(f.provider, 'stream')
      .synthesize('Hello', controller.signal)
      [Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow('aborted');
    expect(f.openStream).not.toHaveBeenCalled();
    expect(f.emitter.listenerCount('error')).toBe(0);
  });
});
