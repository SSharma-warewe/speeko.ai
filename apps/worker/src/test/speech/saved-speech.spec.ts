import { initializeLogger, llm, voice } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { dirname, join } from 'node:path';
import {
  createSavedSpeechState,
  guardSavedSpeechCompletion,
} from '../../speech/saved-speech';
import {
  configuredCompletionBlocker,
  createConfigurableTask,
} from '../../tasks/configurable.task';
import {
  VOICE_TASK_STARTERS,
  compileVoiceTaskInstructions,
  savedSpeechHookText,
  voiceTaskDefinitionErrors,
  type AgentJobMetadata,
  type VoiceTaskDefinition,
} from '@call-agent/contracts';
import { preparedSentences } from '../../speech/prepared-sentences';
import {
  buildClosingSpeech,
  buildOpeningInstructions,
} from '../../builders/prompt-builder';
import type { SessionUserData } from '../../tools/types';
import {
  inboundScriptCacheLines,
  inboundServiceTrackLines,
} from '../../tasks/inbound-service-tracks';

const sentence = {
  key: 'ask_budget',
  text: 'What is your budget?',
  whenToUse: 'Budget is missing',
  prepare: true,
};
const definition = (): VoiceTaskDefinition => ({
  ...VOICE_TASK_STARTERS.general,
  savedSpeech: { sentences: [sentence] },
});
const metadata = (def = definition(), model?: string): AgentJobMetadata => ({
  agentKey: 'fixture',
  direction: 'inbound',
  task: 'general',
  enabledTools: [],
  prompt: { systemPrompt: 'Fixture' },
  model,
  voiceTask: {
    schemaVersion: 1,
    taskId: '58e8e268-373a-4c21-9371-70ad71d0112f',
    version: 1,
    definition: def,
  },
});
const user = (): SessionUserData => ({ context: {} });
const signal = () => new AbortController().signal;

describe('task saved speech contracts and hooks', () => {
  it('keeps old tasks valid and validates all starter definitions including the real estate example', () => {
    for (const d of Object.values(VOICE_TASK_STARTERS))
      expect(voiceTaskDefinitionErrors(d)).toEqual([]);
    const example =
      VOICE_TASK_STARTERS.real_estate_receptionist.savedSpeech!.sentences;
    expect(example).toHaveLength(11);
    expect(example.map((s) => s.text).sort()).toEqual(
      [...inboundServiceTrackLines(), ...inboundScriptCacheLines()].sort(),
    );
  });
  it.each([
    [
      'too many',
      (d: any) => {
        d.savedSpeech.sentences = Array.from({ length: 21 }, (_, i) => ({
          ...sentence,
          key: `key_${i}`,
        }));
      },
    ],
    [
      'duplicate',
      (d: any) => {
        d.savedSpeech.sentences.push(sentence);
      },
    ],
    [
      'unsafe key',
      (d: any) => {
        d.savedSpeech.sentences[0].key = '__proto__';
      },
    ],
    [
      'non-string key',
      (d: any) => {
        d.savedSpeech.sentences[0].key = true;
      },
    ],
    [
      'long text',
      (d: any) => {
        d.savedSpeech.sentences[0].text = 'x'.repeat(501);
      },
    ],
    [
      'blank text',
      (d: any) => {
        d.savedSpeech.sentences[0].text = ' ';
      },
    ],
    [
      'usage',
      (d: any) => {
        d.savedSpeech.sentences[0].whenToUse = 'x'.repeat(1001);
      },
    ],
    [
      'placeholder',
      (d: any) => {
        d.savedSpeech.sentences[0].text = 'Hello {{name}}';
      },
    ],
    [
      'boolean',
      (d: any) => {
        d.savedSpeech.sentences[0].prepare = 'true';
      },
    ],
    [
      'unknown field',
      (d: any) => {
        d.savedSpeech.sentences[0].code = 'execute()';
      },
    ],
    [
      'opening reference',
      (d: any) => {
        d.savedSpeech.opening = { mode: 'sentence', key: 'missing' };
      },
    ],
    [
      'phase reference',
      (d: any) => {
        d.phases[0].sentenceKeys = ['missing'];
      },
    ],
    [
      'silent extra key',
      (d: any) => {
        d.savedSpeech.closing = { mode: 'silent', key: sentence.key };
      },
    ],
  ])('rejects %s', (_, change) => {
    const d = structuredClone(definition());
    change(d);
    expect(voiceTaskDefinitionErrors(d)).not.toEqual([]);
  });
  it('accepts exactly 20 sentences and compiles keyed or native wording guidance', () => {
    const d = definition();
    d.savedSpeech!.sentences = Array.from({ length: 20 }, (_, i) => ({
      ...sentence,
      key: `key_${i}`,
    }));
    d.phases = [{ ...d.phases[0], sentenceKeys: ['key_0'] }];
    expect(voiceTaskDefinitionErrors(d)).toEqual([]);
    expect(compileVoiceTaskInstructions(d)).toContain('speak_saved_sentence');
    expect(compileVoiceTaskInstructions(d)).toContain(
      'Phase 1 saved sentence keys: key_0',
    );
    expect(
      compileVoiceTaskInstructions(d, { nativeSpeech: true }),
    ).not.toContain('speak_saved_sentence');
  });
  it('task hooks override agent hooks while absent selections preserve defaults', () => {
    const d = definition();
    d.savedSpeech!.opening = { mode: 'sentence', key: sentence.key };
    d.savedSpeech!.closing = { mode: 'silent' };
    const meta = {
      ...metadata(d),
      prompt: {
        systemPrompt: 'Fixture',
        onEnterInstructions: '',
        onExitInstructions: 'Old closing',
      },
    };
    expect(buildOpeningInstructions(meta)).toContain(sentence.text);
    expect(buildClosingSpeech(meta)).toBeNull();
    expect(savedSpeechHookText(undefined, 'opening')).toBeUndefined();
    d.savedSpeech!.opening = { mode: 'silent' };
    expect(buildOpeningInstructions(meta)).toBeNull();
    d.savedSpeech!.closing = { mode: 'agent' };
    expect(buildClosingSpeech(meta)).toBe('Old closing');
  });
  it('prepares only selected text in order, deduplicates, and gives exact opening foreground priority', () => {
    const d = definition();
    d.savedSpeech!.sentences.push(
      { ...sentence, key: 'same' },
      { ...sentence, key: 'live_only', text: 'Live only', prepare: false },
    );
    expect(
      preparedSentences(metadata(d)).filter((t) => t === sentence.text),
    ).toHaveLength(1);
    expect(preparedSentences(metadata(d))).not.toContain('Live only');
    d.savedSpeech!.opening = { mode: 'sentence', key: sentence.key };
    d.savedSpeech!.closing = { mode: 'sentence', key: 'live_only' };
    expect(preparedSentences(metadata(d))).toEqual([]);
    expect(
      preparedSentences(metadata(d, 'xai/grok-voice-think-fast-2.0')),
    ).toEqual([]);
  });
});

describe('keyed playback and cancellation', () => {
  beforeAll(() => initializeLogger({ pretty: false, level: 'silent' }));
  it('the installed SDK requires no follow-up model reply for successful undefined output', () => {
    const { createToolOutput } = require(
      join(dirname(require.resolve('@livekit/agents')), 'voice/generation.cjs'),
    );
    const output = createToolOutput({
      toolCall: llm.FunctionCall.create({
        name: 'speak_saved_sentence',
        callId: 'one',
        args: '{}',
      }),
      output: undefined,
    });
    expect(output.replyRequired).toBe(false);
  });
  it.each([false, true])(
    'suppresses same-step completion regardless of tool arrival order (saved first: %s)',
    async (savedFirst) => {
      const call = (name: string): llm.ChatChunk => ({
        id: 'step',
        delta: {
          role: 'assistant',
          toolCalls: [
            llm.FunctionCall.create({ name, callId: name, args: '{}' }),
          ],
        },
      });
      const chunks = [
        call('complete_voice_task'),
        call('speak_saved_sentence'),
      ];
      if (savedFirst) chunks.reverse();
      const input = new ReadableStream<llm.ChatChunk | string>({
        start(c) {
          for (const chunk of chunks) c.enqueue(chunk);
          c.close();
        },
      });
      const output = [];
      for await (const chunk of guardSavedSpeechCompletion(input))
        output.push(chunk);
      expect(
        output
          .flatMap((c) =>
            typeof c === 'string' ? [] : (c.delta?.toolCalls ?? []),
          )
          .map((t) => t.name),
      ).toEqual(['speak_saved_sentence']);
    },
  );
  it('streams saved keys immediately, keeps text and metrics, and preserves completion-only turns', async () => {
    let source!: ReadableStreamDefaultController<llm.ChatChunk | string>;
    const input = new ReadableStream<llm.ChatChunk | string>({
      start(c) {
        source = c;
      },
    });
    const reader = guardSavedSpeechCompletion(input).getReader();
    source.enqueue('Ordinary text');
    expect((await reader.read()).value).toBe('Ordinary text');
    source.enqueue({
      id: 'step',
      delta: {
        role: 'assistant',
        toolCalls: [
          llm.FunctionCall.create({
            name: 'speak_saved_sentence',
            callId: 'key',
            args: '{}',
          }),
        ],
      },
    });
    expect(
      ((await reader.read()).value as llm.ChatChunk).delta!.toolCalls![0].name,
    ).toBe('speak_saved_sentence');
    await reader.cancel();
    const finish = llm.FunctionCall.create({
      name: 'complete_voice_task',
      callId: 'finish',
      args: '{}',
    });
    const usage = {
      completionTokens: 1,
      promptTokens: 1,
      promptCachedTokens: 0,
      totalTokens: 2,
    };
    const single = new ReadableStream<llm.ChatChunk | string>({
      start(c) {
        c.enqueue({
          id: 'step',
          delta: { role: 'assistant', toolCalls: [finish] },
          usage,
        });
        c.close();
      },
    });
    const chunks = [];
    for await (const chunk of guardSavedSpeechCompletion(single))
      chunks.push(chunk);
    expect(chunks).toEqual([
      { id: 'step', delta: { role: 'assistant', toolCalls: [] }, usage },
      { id: 'step', delta: { role: 'assistant', toolCalls: [finish] } },
    ]);
  });
  it('cancels finite-audio capture when playback fails', async () => {
    const data = user();
    let captureSignal: AbortSignal | undefined;
    data.ttsCache = {
      canCacheFinite: () => true,
      finiteAudio: (_: string, options: { signal: AbortSignal }) => {
        captureSignal = options.signal;
        return new ReadableStream();
      },
    } as never;
    const state = createSavedSpeechState(data);
    const session = {
      say: () => ({
        waitForPlayout: async () => {
          throw new Error('playback closed');
        },
      }),
    };
    await expect(
      state.speak(sentence, session, 'failed', signal()),
    ).rejects.toThrow('playback closed');
    expect(captureSignal?.aborted).toBe(true);
    expect(state.pending).toBe(0);
    state.dispose();
  });
  it('speaks once, returns undefined, records history, and blocks completion until a new caller answer', async () => {
    const data = user();
    const state = createSavedSpeechState(data);
    data.savedSpeechState = state;
    const session = {
      say: jest.fn(() => ({ waitForPlayout: async () => {} })),
    };
    await expect(
      state.speak(sentence, session, 'tool-1', signal()),
    ).resolves.toBeUndefined();
    await state.speak(sentence, session, 'tool-1', signal());
    expect(session.say).toHaveBeenCalledTimes(1);
    expect(session.say).toHaveBeenCalledWith(sentence.text, {
      addToChatCtx: true,
      allowInterruptions: true,
    });
    expect(
      configuredCompletionBlocker(
        definition(),
        { outcome: 'COMPLETED' },
        data,
        'prior answer',
      ),
    ).toMatch(/Wait/);
    await expect(
      state.speak(sentence, session, 'tool-2', signal()),
    ).rejects.toBeInstanceOf(voice.StopResponse);
    state.userTurn();
    expect(
      configuredCompletionBlocker(
        definition(),
        { outcome: 'COMPLETED' },
        data,
        'new answer',
      ),
    ).toBeNull();
    await state.speak(sentence, session, 'tool-2', signal());
    expect(session.say).toHaveBeenCalledTimes(2);
    state.dispose();
  });
  it('serializes calls and cancels stalled playback and queued work without retry or listeners', async () => {
    const data = user();
    const state = createSavedSpeechState(data);
    const interrupt = jest.fn();
    const session = {
      say: jest.fn(() => ({
        waitForPlayout: () => new Promise<void>(() => {}),
        interrupt,
      })),
    };
    const abort = new AbortController();
    const remove = jest.spyOn(abort.signal, 'removeEventListener');
    const one = state.speak(sentence, session, 'one', abort.signal);
    await Promise.resolve();
    state.userTurn();
    const two = state.speak(sentence, session, 'two', signal());
    expect(session.say).toHaveBeenCalledTimes(1);
    state.dispose();
    state.dispose();
    await Promise.all([one, two]);
    expect(interrupt).toHaveBeenCalledTimes(1);
    expect(state.pending).toBe(0);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    await state.speak(sentence, session, 'three', signal());
    expect(session.say).toHaveBeenCalledTimes(1);
  });
  it('aborts a tool playback and never automatically retries it', async () => {
    const state = createSavedSpeechState(user());
    const interrupt = jest.fn();
    const session = {
      say: jest.fn(() => ({
        waitForPlayout: () => new Promise<void>(() => {}),
        interrupt,
      })),
    };
    const abort = new AbortController();
    const work = state.speak(sentence, session, 'one', abort.signal);
    await Promise.resolve();
    abort.abort();
    await work;
    await state.speak(sentence, session, 'one', signal());
    expect(interrupt).toHaveBeenCalledTimes(1);
    expect(session.say).toHaveBeenCalledTimes(1);
    expect(state.pending).toBe(0);
    state.dispose();
  });
  it('bounds tool-call reservations', async () => {
    const state = createSavedSpeechState(user());
    const session = { say: jest.fn() };
    for (let i = 0; i < 256; i++) {
      state.userTurn();
      await state.speak(sentence, session, `tool-${i}`, signal());
    }
    state.userTurn();
    await expect(
      state.speak(sentence, session, 'overflow', signal()),
    ).rejects.toBeInstanceOf(llm.ToolError);
    state.dispose();
  });
  it('registers one pipeline-only tool constrained to snapshot keys and blocks parallel completion', async () => {
    const create = jest
      .spyOn(voice.AgentTask, 'create')
      .mockReturnValue({ session: { say: jest.fn() } } as never);
    try {
      createConfigurableTask({
        meta: metadata(),
        userData: user(),
        tools: [],
        chatCtx: undefined,
      } as never);
      const options = create.mock.calls[0][0] as any;
      const tool = options.tools.find(
        (t: any) => t.name === 'speak_saved_sentence',
      );
      expect(tool.parameters.safeParse({ key: sentence.key }).success).toBe(
        true,
      );
      expect(tool.parameters.safeParse({ key: 'foreign_key' }).success).toBe(
        false,
      );
      await expect(
        tool.execute(
          { key: sentence.key },
          { toolCallId: 'one', abortSignal: signal() },
        ),
      ).resolves.toBeUndefined();
      const complete = options.tools.find(
        (t: any) => t.name === 'complete_voice_task',
      );
      await expect(
        complete.execute(
          { outcome: 'COMPLETED' },
          {
            ctx: {
              speechHandle: {
                chatItems: [
                  { type: 'function_call', name: 'speak_saved_sentence' },
                ],
              },
            },
          },
        ),
      ).rejects.toBeInstanceOf(voice.StopResponse);
      createConfigurableTask({
        meta: metadata(definition(), 'xai/grok-voice-think-fast-2.0'),
        userData: user(),
        tools: [],
        chatCtx: undefined,
      } as never);
      const native = create.mock.calls[1][0] as any;
      expect(
        native.tools.some((t: any) => t.name === 'speak_saved_sentence'),
      ).toBe(false);
      expect(native.instructions).not.toContain('call speak_saved_sentence');
    } finally {
      create.mockRestore();
    }
  });
});
