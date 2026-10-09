import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { AudioFrame } from '@livekit/rtc-node';
import { initializeLogger, voice, tts, tokenize } from '@livekit/agents';
import type { AgentJobMetadata } from '../../session/job-metadata';
import { resolveTtsConfiguration } from '../../builders/model-builder';
import { TtsCacheRuntime } from '../../speech/tts-cache-runtime';
import { createCachedTtsNode } from '../../speech/cached-tts-node';

const firstSentence = 'This is the first complete sentence.';
const secondSentence = 'This is the second complete sentence.';
const thirdSentence = 'This is the third complete sentence.';
function fixture(
  ttsModel: AgentJobMetadata['ttsModel'] = 'openai/gpt-4o-mini-tts',
) {
  const meta: AgentJobMetadata = {
    agentKey: 'inbound',
    direction: 'inbound',
    task: 'general',
    organizationId: 'org-1',
    prompt: { systemPrompt: 'Test' },
    enabledTools: ['endCall'],
    ttsModel,
  };
  const provider = Object.assign(new EventEmitter(), {
    sampleRate: 24000,
    numChannels: 1,
    synthesize: jest.fn(),
    stream: jest.fn(),
    close: jest.fn(),
  }) as unknown as tts.TTS;
  const cache = new TtsCacheRuntime(
    meta,
    resolveTtsConfiguration(meta),
    provider,
  );
  const agent = { expressive: false } as voice.Agent;
  const ctx = {
    agent,
    tts: provider,
    session: { _expressive: false },
  } as Parameters<NonNullable<voice.AgentHooks['ttsNode']>>[0];
  const node = createCachedTtsNode(cache);
  agent.getActivityOrThrow = () =>
    ({ tts: ctx.tts }) as ReturnType<voice.Agent['getActivityOrThrow']>;
  const run = async (input: AsyncIterable<string>) =>
    (await node(ctx, input, {}))![Symbol.asyncIterator]();
  return { cache, provider, ctx, run };
}
async function* words(...chunks: string[]) {
  yield* chunks;
}
async function inputText(input: ReadableStream<string>) {
  const reader = input.getReader();
  let result = '';
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return result;
      result += next.value;
    }
  } finally {
    reader.releaseLock();
  }
}
function frame(value: number, text = 'spoken') {
  return new AudioFrame(new Int16Array([value, value]), 24000, 1, 2, {
    'lk.timed_transcripts': [
      voice.createTimedString({ text, startTime: 0, endTime: 2 / 24000 }),
    ],
  });
}
function audio(...frames: AudioFrame[]) {
  return new ReadableStream<AudioFrame>({
    start(output) {
      frames.forEach((f) => output.enqueue(f));
      output.close();
    },
  });
}
async function drain(iterator: AsyncIterator<AudioFrame>) {
  const frames: AudioFrame[] = [];
  while (true) {
    const next = await iterator.next();
    if (next.done) return frames;
    frames.push(next.value);
  }
}

describe('generated speech cache node', () => {
  beforeAll(() => initializeLogger({ pretty: false, level: 'silent' }));
  afterEach(() => jest.restoreAllMocks());
  it.each(['parent', 'task'] as const)(
    'caches the session-inherited provider through the real %s SDK hook context',
    async (kind) => {
      const { cache, provider } = fixture('sarvam/bulbul-v3-realtime');
      const options = {
        instructions: 'Test',
        ttsNode: createCachedTtsNode(cache),
      };
      const agent = kind === 'parent'
        ? voice.Agent.create(options)
        : voice.AgentTask.create(options);
      // Production sets TTS on the session, leaving agent.tts / ctx.tts unset.
      expect(agent.tts).toBeUndefined();
      jest.spyOn(agent, 'getActivityOrThrow').mockReturnValue({
        tts: provider,
        agentSession: { tts: provider, _expressive: false },
      } as unknown as ReturnType<voice.Agent['getActivityOrThrow']>);
      const sdk = jest.spyOn(voice.Agent.default, 'ttsNode')
        .mockImplementation(async (_agent, input) =>
          audio(frame(1, await inputText(input))),
        );
      const run = async () => {
        const stream = await agent.ttsNode(words(firstSentence), {});
        const reader = stream!.getReader();
        const frames: AudioFrame[] = [];
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) return frames;
            frames.push(next.value);
          }
        } finally {
          reader.releaseLock();
        }
      };
      try {
        expect(await run()).toHaveLength(1);
        expect(await run()).toHaveLength(1);
        expect(sdk).toHaveBeenCalledTimes(1);
        expect(cache.stats.hits).toBe(1);
        expect(cache.stats.bypasses).toBe(0);
      } finally {
        cache.dispose();
      }
    },
  );
  it('releases a node interrupted before synthesis starts', async () => {
    const { cache, run } = fixture();
    const sdk = jest.spyOn(voice.Agent.default, 'ttsNode');
    const iterator = await run(words(firstSentence));
    await iterator.return!();
    expect(cache.stats.active).toBe(0);
    expect(sdk).not.toHaveBeenCalled();
    cache.dispose();
  });
  it.each([
    'inworld/inworld-tts-2',
    'fishaudio/s2.1-pro-free',
    'openai/gpt-4o-mini-tts',
    'sarvam/bulbul-v3',
    'sarvam/bulbul-v3-realtime',
  ] as const)(
    'captures original %s synthesis at SDK boundaries and replays final flush',
    async (model) => {
      const { cache, run, ctx } = fixture(model);
      const spoken: string[] = [];
      const sdk = jest
        .spyOn(voice.Agent.default, 'ttsNode')
        .mockImplementation(async (agent, input) => {
          expect(agent).toBe(ctx.agent);
          const text = await inputText(input);
          spoken.push(text);
          return audio(frame(spoken.length, text));
        });
      const text = `${firstSentence} ${secondSentence} Short tail`;
      const tokenizer =
        cache.config.backend === 'livekit-inference'
          ? tts.sentenceTokenizer(cache.config.runtimeModel.split('/')[0]!, {
              expressive: false,
            })
          : new tokenize.basic.SentenceTokenizer({
              minSentenceLength: model === 'sarvam/bulbul-v3-realtime' ? 8 : 20,
            });
      const expected = tokenizer.stream();
      expected.pushText(text);
      expected.endInput();
      const tokens: string[] = [];
      for await (const item of expected) tokens.push(item.token);
      expected.close();
      const cold = await drain(
        await run(words(text.slice(0, 12), text.slice(12))),
      );
      expect(spoken).toEqual(tokens);
      expect(cold).toHaveLength(tokens.length);
      expect(cache.stats.entries).toBe(tokens.length);
      const hot = await drain(await run(words(text)));
      expect(hot.map((f) => f.data[0])).toEqual(cold.map((f) => f.data[0]));
      expect(sdk).toHaveBeenCalledTimes(tokens.length);
      expect(hot[1].userdata['lk.timed_transcripts']).toEqual(
        cold[1].userdata['lk.timed_transcripts'],
      );
      expect(
        (hot[1].userdata['lk.timed_transcripts'] as voice.TimedString[])[0]
          .startTime,
      ).toBe(2 / 24000);
      cache.dispose();
    },
  );
  it('emits first audio before generated input ends without additional sentence buffering', async () => {
    const { cache, run } = fixture();
    let finish!: () => void;
    let ended = false;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const sdk = jest
      .spyOn(voice.Agent.default, 'ttsNode')
      .mockImplementation(async (_agent, input) =>
        audio(frame(1, await inputText(input))),
      );
    const input = (async function* () {
      yield `${firstSentence} ${secondSentence} `;
      await waiting;
      ended = true;
      yield thirdSentence;
    })();
    const iterator = await run(input);
    expect((await iterator.next()).value.data[0]).toBe(1);
    expect(ended).toBe(false);
    expect(sdk).toHaveBeenCalled();
    finish();
    await drain(iterator);
    cache.dispose();
  });
  it.each(['xai', 'expressive', 'provider-mismatch'] as const)(
    'passes %s input unchanged to the SDK',
    async (reason) => {
      const { cache, run, ctx } = fixture(
        reason === 'xai' ? 'xai/tts-1' : undefined,
      );
      if (reason === 'expressive') ctx.agent.expressive = true;
      if (reason === 'provider-mismatch') ctx.tts = {} as tts.TTS;
      const chunks: string[] = [];
      const sdk = jest
        .spyOn(voice.Agent.default, 'ttsNode')
        .mockImplementation(async (_agent, input) => {
          const reader = input.getReader();
          return new ReadableStream<AudioFrame>({
            async pull(output) {
              const next = await reader.read();
              if (next.done) {
                reader.releaseLock();
                output.close();
              } else {
                chunks.push(next.value);
                output.enqueue(frame(1));
              }
            },
          });
        });
      expect(
        await drain(await run(words('one ', 'word ', 'at a time'))),
      ).toHaveLength(3);
      expect(chunks).toEqual(['one ', 'word ', 'at a time']);
      expect(sdk).toHaveBeenCalledTimes(1);
      expect(cache.stats.entries).toBe(0);
      expect(cache.stats.bypasses).toBe(1);
      cache.dispose();
    },
  );
  it('limits prefetch to two segments and plays frames in order despite faster lookahead', async () => {
    const { cache, run } = fixture();
    let first!: ReadableStreamDefaultController<AudioFrame>;
    const sdk = jest
      .spyOn(voice.Agent.default, 'ttsNode')
      .mockImplementation(async (_agent, input) => {
        const text = await inputText(input);
        return text === firstSentence
          ? new ReadableStream<AudioFrame>({
              start(output) {
                first = output;
                output.enqueue(frame(1));
              },
            })
          : audio(frame(text === secondSentence ? 2 : 3));
      });
    const iterator = await run(
      words(`${firstSentence} ${secondSentence} ${thirdSentence}`),
    );
    expect((await iterator.next()).value.data[0]).toBe(1);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(sdk).toHaveBeenCalledTimes(2);
    first.enqueue(frame(4));
    first.close();
    expect((await drain(iterator)).map((f) => f.data[0])).toEqual([4, 2, 3]);
    cache.dispose();
  });
  it('interrupts a stalled provider read and abandons partial captures without closing TTS', async () => {
    const { cache, provider, run } = fixture();
    const cancelled = jest.fn();
    jest.spyOn(voice.Agent.default, 'ttsNode').mockImplementation(
      async () =>
        new ReadableStream<AudioFrame>({
          start(output) {
            output.enqueue(frame(1));
          },
          cancel: cancelled,
        }),
    );
    const iterator = await run(words(firstSentence));
    await iterator.next();
    const pending = iterator.next();
    const returned = iterator.return!();
    await pending;
    await returned;
    expect(cancelled).toHaveBeenCalled();
    expect(cache.stats.entries).toBe(0);
    expect(cache.stats.pending).toBe(0);
    expect(cache.stats.captureBytes).toBe(0);
    expect(cache.stats.active).toBe(0);
    expect(provider.close).not.toHaveBeenCalled();
    cache.dispose();
  });
  it('propagates a generated input failure without publishing partial speech', async () => {
    const { cache, run } = fixture();
    jest
      .spyOn(voice.Agent.default, 'ttsNode')
      .mockResolvedValue(audio(frame(1)));
    const input = (async function* () {
      yield firstSentence;
      throw new Error('generation failed');
    })();
    await expect(drain(await run(input))).rejects.toThrow('generation failed');
    expect(cache.stats.entries).toBe(0);
    expect(cache.stats.active).toBe(0);
    cache.dispose();
  });
});
