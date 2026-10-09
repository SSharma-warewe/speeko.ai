import { EventEmitter } from 'node:events';
import { voice, type llm } from '@livekit/agents';
import {
  VOICE_TASK_STARTERS,
  type AgentJobMetadata,
} from '@call-agent/contracts';
import { withToolWaiting } from '../../speech/tool-waiting';
import { preparedSentences } from '../../speech/prepared-sentences';
import type { SessionUserData } from '../../tools/types';
import type { TtsCacheRuntime } from '../../speech/tts-cache-runtime';

const meta = (): AgentJobMetadata => ({
  agentKey: 'fixture',
  direction: 'outbound',
  task: 'general',
  prompt: { systemPrompt: 'Fixture' },
  voiceTask: {
    schemaVersion: 1,
    taskId: 'fixture',
    version: 1,
    definition: {
      ...VOICE_TASK_STARTERS.general,
      toolIds: ['scheduleGhlMeeting'],
      savedSpeech: {
        sentences: [
          {
            key: 'waiting_book',
            text: 'Booking that time.',
            whenToUse: '',
            prepare: true,
            purpose: 'toolWaiting',
          },
        ],
        toolWaiting: {
          enabled: true,
          tools: {
            scheduleGhlMeeting: {
              mode: 'custom',
              sentenceKey: 'waiting_book',
              delayMs: 400,
            },
          },
        },
      },
    },
  },
});
function fixture() {
  const session = new EventEmitter() as EventEmitter & {
    waitForIdle: jest.Mock;
    say: jest.Mock;
  };
  session.waitForIdle = jest.fn().mockResolvedValue(undefined);
  const interrupt = jest.fn();
  const waitForPlayout = jest.fn(() => new Promise(() => {}));
  session.say = jest.fn(() => ({ interrupt, waitForPlayout }));
  const speech = {
    numSteps: 1,
    waitIfNotInterrupted: async (promises: Promise<unknown>[]) => {
      await Promise.all(promises);
    },
  };
  const ctx = new voice.RunContext(session as any, speech as any, {} as any);
  const controller = new AbortController();
  const opts = {
    ctx,
    toolCallId: 'test',
    abortSignal: controller.signal,
  } as llm.ToolOptions;
  const userData: SessionUserData = { context: {} };
  let finish!: (value: string) => void;
  let fail!: (error: Error) => void;
  const operation = jest.fn(
    () =>
      new Promise<string>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      }),
  );
  return {
    session,
    interrupt,
    waitForPlayout,
    opts,
    controller,
    userData,
    operation,
    finish: (v = 'done') => finish(v),
    fail: () => fail(new Error('operation failed')),
  };
}

describe('LiveKit tool waiting playback', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('starts immediately and suppresses speech for fast results', async () => {
    const f = fixture();
    const result = withToolWaiting(
      meta(),
      f.userData,
      'scheduleGhlMeeting',
      f.opts,
      f.operation,
    );
    expect(f.operation).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(220);
    f.finish();
    await expect(result).resolves.toBe('done');
    await jest.advanceTimersByTimeAsync(1000);
    expect(f.session.say).not.toHaveBeenCalled();
    expect(f.session.eventNames()).toEqual([]);
  });
  it('uses cached audio after the quiet delay and interrupts it without waiting for playout', async () => {
    const f = fixture();
    const finiteAudio = jest.fn(() => new ReadableStream());
    f.userData.ttsCache = {
      canCacheFinite: () => true,
      finiteAudio,
    } as unknown as TtsCacheRuntime;
    const result = withToolWaiting(
      meta(),
      f.userData,
      'scheduleGhlMeeting',
      f.opts,
      f.operation,
    );
    await jest.advanceTimersByTimeAsync(399);
    expect(f.session.say).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(f.session.say).toHaveBeenCalledWith(
      'Booking that time.',
      expect.objectContaining({
        audio: expect.any(ReadableStream),
        addToChatCtx: false,
        allowInterruptions: true,
      }),
    );
    f.finish();
    await expect(result).resolves.toBe('done');
    expect(f.interrupt).toHaveBeenCalled();
    expect(f.waitForPlayout).not.toHaveBeenCalled();
    expect(f.operation).toHaveBeenCalledTimes(1);
  });
  it('resets the dwell on caller speech and waits until silence resumes', async () => {
    const f = fixture();
    const result = withToolWaiting(
      meta(),
      f.userData,
      'scheduleGhlMeeting',
      f.opts,
      f.operation,
    );
    await jest.advanceTimersByTimeAsync(300);
    let idle!: () => void;
    f.session.waitForIdle.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          idle = resolve;
        }),
    );
    f.session.emit(voice.AgentSessionEventTypes.UserStateChanged, {
      newState: 'speaking',
    });
    await jest.advanceTimersByTimeAsync(1000);
    expect(f.session.say).not.toHaveBeenCalled();
    idle();
    await jest.advanceTimersByTimeAsync(400);
    expect(f.session.say).toHaveBeenCalledTimes(1);
    f.finish();
    await result;
  });
  it('prevents concurrent tools from stacking fillers', async () => {
    const a = fixture(),
      b = fixture();
    const first = withToolWaiting(
      meta(),
      a.userData,
      'scheduleGhlMeeting',
      a.opts,
      a.operation,
    );
    const second = withToolWaiting(
      meta(),
      a.userData,
      'scheduleGhlMeeting',
      b.opts,
      b.operation,
    );
    await jest.advanceTimersByTimeAsync(400);
    expect(
      a.session.say.mock.calls.length + b.session.say.mock.calls.length,
    ).toBe(1);
    a.finish();
    b.finish();
    await Promise.all([first, second]);
    expect(a.userData.toolWaitingState!.active).toBeUndefined();
  });
  it('does not fail or retry the operation when filler playback fails', async () => {
    const f = fixture();
    f.session.say.mockImplementation(() => {
      throw new Error('closed');
    });
    const result = withToolWaiting(
      meta(),
      f.userData,
      'scheduleGhlMeeting',
      f.opts,
      f.operation,
    );
    await jest.advanceTimersByTimeAsync(400);
    f.finish();
    await expect(result).resolves.toBe('done');
    expect(f.operation).toHaveBeenCalledTimes(1);
  });
  it('cleans up speech on tool failure and preserves the tool error', async () => {
    const f = fixture();
    const result = withToolWaiting(
      meta(),
      f.userData,
      'scheduleGhlMeeting',
      f.opts,
      f.operation,
    );
    const assertion = expect(result).rejects.toThrow('operation failed');
    await jest.advanceTimersByTimeAsync(400);
    f.fail();
    await assertion;
    expect(f.interrupt).toHaveBeenCalled();
  });
  it.each(['abort', 'close'])(
    'cancels waiting on %s without restarting the operation',
    async (reason) => {
      const f = fixture();
      const result = withToolWaiting(
        meta(),
        f.userData,
        'scheduleGhlMeeting',
        f.opts,
        f.operation,
      );
      await jest.advanceTimersByTimeAsync(400);
      if (reason === 'abort') f.controller.abort();
      else f.userData.toolWaitingState!.dispose();
      expect(f.interrupt).toHaveBeenCalled();
      f.finish();
      await result;
      expect(f.operation).toHaveBeenCalledTimes(1);
      expect(f.session.eventNames()).toEqual([]);
    },
  );
  it('skips unconfigured, disabled, off, and native speech agents', async () => {
    for (const kind of ['missing', 'disabled', 'off', 'native']) {
      const m = meta(),
        f = fixture();
      if (kind === 'missing')
        delete m.voiceTask!.definition.savedSpeech!.toolWaiting;
      if (kind === 'disabled')
        m.voiceTask!.definition.savedSpeech!.toolWaiting!.enabled = false;
      if (kind === 'off')
        m.voiceTask!.definition.savedSpeech!.toolWaiting!.tools.scheduleGhlMeeting =
          { mode: 'off' };
      if (kind === 'native') m.model = 'xai/grok-voice-think-fast-2.0';
      const result = withToolWaiting(
        m,
        f.userData,
        'scheduleGhlMeeting',
        f.opts,
        f.operation,
      );
      await jest.advanceTimersByTimeAsync(1000);
      f.finish();
      await result;
      expect(f.session.say).not.toHaveBeenCalled();
    }
  });
  it('prepares enabled tool-only sentences and excludes them when disabled or native', () => {
    const m = meta();
    expect(preparedSentences(m)).toContain('Booking that time.');
    m.voiceTask!.definition.savedSpeech!.toolWaiting!.enabled = false;
    expect(preparedSentences(m)).not.toContain('Booking that time.');
    m.model = 'xai/grok-voice-think-fast-2.0';
    expect(preparedSentences(m)).toEqual([]);
  });
});
