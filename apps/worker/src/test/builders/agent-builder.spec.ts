jest.mock('../../builders/model-builder', () => ({
  ...jest.requireActual('../../builders/model-builder'),
  buildModels: jest.fn(),
}));
jest.mock('../../builders/tool-builder', () => ({
  buildTools: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../builders/voice-builder', () => ({
  buildAgentSession: jest.fn(),
}));
import { EventEmitter } from 'node:events';
import { voice, type tts } from '@livekit/agents';
import { VOICE_TASK_STARTERS } from '@call-agent/contracts';
import type { AgentJobMetadata } from '../../session/job-metadata';
import { AgentRuntimeBuilder } from '../../builders/agent-builder';
import { buildModels } from '../../builders/model-builder';
import { buildAgentSession } from '../../builders/voice-builder';
import { buildTools } from '../../builders/tool-builder';
import * as taskBuilder from '../../builders/task-builder';
import { createWorkflowTask } from '../../tasks/workflow-task';
import { TtsSharedCacheClient } from '../../speech/tts-shared-cache-client';
import { TtsCacheRuntime } from '../../speech/tts-cache-runtime';
const metadata = (extra: Partial<AgentJobMetadata> = {}): AgentJobMetadata => ({
  agentKey: 'outbound',
  direction: 'outbound',
  task: 'general',
  prompt: { systemPrompt: 'Test' },
  enabledTools: ['endCall'],
  ttsCacheEnabled: true,
  ...extra,
});
function providerFixture() {
  return Object.assign(new EventEmitter(), {
    sampleRate: 24000,
    numChannels: 1,
    synthesize: jest.fn(),
    stream: jest.fn(),
    close: jest.fn(),
  }) as unknown as tts.TTS;
}
describe('agent-builder job cache integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(voice.Agent, 'create').mockReturnValue({} as voice.Agent);
    jest
      .spyOn(voice.AgentTask, 'create')
      .mockReturnValue({} as voice.AgentTask);
    jest
      .mocked(buildAgentSession)
      .mockReturnValue({ on: jest.fn() } as unknown as voice.AgentSession);
    jest.mocked(buildTools).mockResolvedValue({});
  });
  afterEach(() => jest.restoreAllMocks());

  it('reuses the pre-dial cache and TTS provider instead of creating another cache', async () => {
    const provider = providerFixture();
    jest
      .mocked(buildModels)
      .mockReturnValue({ kind: 'pipeline', tts: provider } as never);
    const meta = metadata({ ttsPreparedSpeechEnabled: true });
    const prepared = new TtsCacheRuntime(
      meta,
      { backend: 'sarvam-plugin' } as never,
      provider,
    );
    try {
      const runtime = await new AgentRuntimeBuilder(
        meta,
        'room',
        prepared,
      ).build();
      expect(buildModels).toHaveBeenCalledWith(meta, undefined, provider);
      expect(runtime.userData.ttsCache).toBe(prepared);
      runtime.userData.savedSpeechState?.dispose();
    } finally {
      prepared.dispose();
    }
  });

  it.each([false, true])('plays the configured opening without LLM generation or duplicate preparation (automatic cache: %s)', async (automatic) => {
    const opening = 'Hi! I can help you schedule an appointment. What date and time would you prefer?';
    jest.mocked(buildModels).mockReturnValue({ kind: 'pipeline', tts: providerFixture() } as never);
    const prepare = jest.spyOn(TtsCacheRuntime.prototype, 'prepare').mockImplementation(() => new Promise(() => {}));
    const handoff = jest.spyOn(taskBuilder, 'buildTask').mockReturnValue({ run: async () => { throw new Error('test shutdown'); } ,
      } as never);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const meta = metadata({ ttsCacheEnabled: automatic, ttsPreparedSpeechEnabled: true, prompt: { systemPrompt: 'Fixture', onEnterInstructions: opening, onExitInstructions: opening ,
        } ,
      });
    const runtime = await new AgentRuntimeBuilder(meta).build();
    let finish!: () => void;
    const say = jest.fn(() => ({ waitForPlayout: () => new Promise<void>((resolve) => { finish = resolve; }) ,
      }));
    const generateReply = jest.fn();
    const hooks = jest.mocked(voice.Agent.create).mock.calls[0][0];
    try {
      const entered = hooks.onEnter!({ session: { say, generateReply }, agent: { chatCtx: { copy: () => ({}) } } ,
        } as never);
      expect(say).toHaveBeenCalledWith(opening, expect.objectContaining({ audio: expect.anything(), allowInterruptions: false, addToChatCtx: true ,
          }),
        );
      expect(generateReply).not.toHaveBeenCalled();
      expect(runtime.userData.ttsCache!.canCacheFinite(opening)).toBe(true);
      expect(prepare.mock.calls[0][0]).not.toContain(opening);
      expect(say.mock.invocationCallOrder[0]).toBeLessThan(prepare.mock.invocationCallOrder[0],
        );
      expect(handoff).not.toHaveBeenCalled();
      finish();
      await entered;
      expect(handoff).toHaveBeenCalledTimes(1);
    } finally {
      runtime.userData.savedSpeechState?.dispose();
      runtime.userData.ttsCache?.dispose();
    }
  },
  );

  it('aborts opening capture when playout fails and lets the task proceed', async () => {
    jest.mocked(buildModels).mockReturnValue({ kind: 'pipeline', tts: providerFixture() } as never);
    jest.spyOn(TtsCacheRuntime.prototype, 'prepare').mockResolvedValue();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const handoff = jest.spyOn(taskBuilder, 'buildTask').mockReturnValue({ run: async () => { throw new Error('test shutdown'); } ,
    } as never);
    let signal: AbortSignal | undefined;
    jest.spyOn(TtsCacheRuntime.prototype, 'finiteAudio').mockImplementation((_text, options) => {
      signal = options?.signal;
      return new ReadableStream();
    });
    const runtime = await new AgentRuntimeBuilder(metadata({ ttsPreparedSpeechEnabled: true, prompt: { systemPrompt: 'Fixture', onEnterInstructions: 'Saved opening' ,
        } ,
      }),
    ).build();
    try {
      const hooks = jest.mocked(voice.Agent.create).mock.calls[0][0];
      const say = jest.fn(() => ({ waitForPlayout: async () => { throw new Error('playout failed'); } ,
      }));
      await hooks.onEnter!({ session: { say }, agent: { chatCtx: { copy: () => ({}) } } ,
      } as never);
      expect(signal?.aborted).toBe(true);
      expect(handoff).toHaveBeenCalledTimes(1);
    } finally {
      runtime.userData.savedSpeechState?.dispose();
      runtime.userData.ttsCache?.dispose();
    }
  });

  it('schedules exact opening first without waiting for preparation and registers eligible foreground text', async () => {
    const provider = providerFixture();
    jest.mocked(buildModels).mockReturnValue({ kind: 'pipeline', tts: provider } as never);
    const definition = structuredClone(VOICE_TASK_STARTERS.real_estate_receptionist,
    );
    definition.savedSpeech!.opening = { mode: 'sentence', key: 'buy_location' };
    definition.savedSpeech!.sentences[0].prepare = false;
    definition.savedSpeech!.sentences.push({ ...definition.savedSpeech!.sentences[0], key: 'same_opening', prepare: true ,
    });
    const meta = metadata({ ttsCacheEnabled: false, ttsPreparedSpeechEnabled: true, voiceTask: { schemaVersion: 1, taskId: '58e8e268-373a-4c21-9371-70ad71d0112f', version: 1, definition ,
      } ,
    });
    const preparation = jest.spyOn(TtsCacheRuntime.prototype, 'prepare').mockImplementation(() => new Promise(() => {}));
    let finish!: () => void;
    const say = jest.fn(() => ({ waitForPlayout: () => new Promise<void>((resolve ) => { finish = resolve; }) ,
    }));
    const runtime = await new AgentRuntimeBuilder(meta).build();
    const ctx = { session: { say, generateReply: jest.fn() } };
    const agentOptions = jest.mocked(voice.Agent.create).mock.calls[0][0] as any;
    const entered = agentOptions.onEnter(ctx);
    expect(say).toHaveBeenCalledWith(definition.savedSpeech!.sentences[0].text, expect.objectContaining({ allowInterruptions: false, addToChatCtx: true ,
      }),
    );
    expect(ctx.session.generateReply).not.toHaveBeenCalled();
    expect(preparation).toHaveBeenCalledTimes(1);
    expect(say.mock.invocationCallOrder[0]).toBeLessThan(preparation.mock.invocationCallOrder[0],
    );
    expect(runtime.userData.ttsCache!.canCacheFinite(definition.savedSpeech!.sentences[0].text,
      ),
    ).toBe(true);
    expect(preparation.mock.calls[0][0]).not.toContain(definition.savedSpeech!.sentences[0].text,
    );
    finish(); await entered;
    runtime.userData.savedSpeechState?.dispose(); runtime.userData.ttsCache?.dispose();
  });
  it.each([
    null,
    'inworld/inworld-tts-2',
    'fishaudio/s2.1-pro-free',
    'openai/gpt-4o-mini-tts',
    'xai/tts-1',
    'sarvam/bulbul-v3',
    'sarvam/bulbul-v3-realtime',
  ])(
    'shares the %s runtime between parent/tasks without startup synthesis',
    async (ttsModel) => {
      const provider = providerFixture();
      const models = { kind: 'pipeline', tts: provider } as ReturnType<
        typeof buildModels
      >;
      jest.mocked(buildModels).mockReturnValue(models);
      const meta = metadata({ ttsModel });
      const runtime = await new AgentRuntimeBuilder(meta).build();
      expect(buildAgentSession).toHaveBeenCalledWith(models, runtime.userData, {
        medium: undefined,
      });
      expect(runtime.userData.ttsCache?.provider).toBe(provider);
      expect(voice.Agent.create).toHaveBeenCalledWith(
        expect.objectContaining({ ttsNode: expect.any(Function) }),
      );
      createWorkflowTask(meta, {
        instructions: 'Task',
        tools: [],
        userData: runtime.userData,
      });
      expect(voice.AgentTask.create).toHaveBeenCalledWith(
        expect.objectContaining({ ttsNode: expect.any(Function) }),
      );
      expect(provider.synthesize).not.toHaveBeenCalled();
      expect(provider.stream).not.toHaveBeenCalled();
      const close = jest.mocked(runtime.session.on).mock
        .calls[0][1] as () => void;
      close();
      expect(runtime.userData.ttsCache?.enabled).toBe(false);
      expect(provider.close).not.toHaveBeenCalled();
    },
  );
  it('does not install a cache for native realtime parent or task', async () => {
    const shared = jest.spyOn(TtsSharedCacheClient, 'create');
    jest
      .mocked(buildModels)
      .mockReturnValue({ kind: 'realtime', llm: {} } as ReturnType<
        typeof buildModels
      >);
    const meta = metadata({ model: 'xai/grok-voice-think-fast-2.0' });
    const runtime = await new AgentRuntimeBuilder(meta).build();
    expect(runtime.userData.ttsCache).toBeUndefined();
    expect(shared).not.toHaveBeenCalled();
    expect(
      jest.mocked(voice.Agent.create).mock.calls[0][0].ttsNode,
    ).toBeUndefined();
    createWorkflowTask(meta, {
      instructions: 'Task',
      tools: [],
      userData: runtime.userData,
    });
    expect(
      jest.mocked(voice.AgentTask.create).mock.calls[0][0].ttsNode,
    ).toBeUndefined();
  });
  it('prepares alongside opening without installing automatic hooks or delaying entry', async () => {
    const provider = providerFixture();
    jest
      .mocked(buildModels)
      .mockReturnValue({ kind: 'pipeline', tts: provider } as ReturnType<
        typeof buildModels
      >);
    const prepare = jest
      .spyOn(TtsCacheRuntime.prototype, 'prepare')
      .mockImplementation(() => new Promise(() => {}));
    const meta = metadata({
      ttsCacheEnabled: false,
      ttsPreparedSpeechEnabled: true,
    });
    const runtime = await new AgentRuntimeBuilder(meta).build();
    expect(runtime.userData.ttsCache?.automaticEnabled).toBe(false);
    const hooks = jest.mocked(voice.Agent.create).mock.calls[0][0];
    expect(hooks.ttsNode).toBeUndefined();
    const generateReply = jest.fn(() => ({
      waitForPlayout: () => new Promise(() => {}),
    }));
    // onEnter should reach generateReply immediately despite an unfinished preparation.
    void hooks.onEnter!({ session: { generateReply }, agent: {} } as never);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(generateReply).toHaveBeenCalledTimes(1);
    runtime.userData.ttsCache?.dispose();
    createWorkflowTask(meta, {
      instructions: 'Task',
      tools: [],
      userData: runtime.userData,
    });
    expect(
      jest.mocked(voice.AgentTask.create).mock.calls[0][0].ttsNode,
    ).toBeUndefined();
  });
  it.each([false, undefined, null, 'true', 1])(
    'does not construct cache state or clients for disabled/malformed %s',
    async (value) => {
      const shared = jest.spyOn(TtsSharedCacheClient, 'create');
      const provider = providerFixture();
      jest
        .mocked(buildModels)
        .mockReturnValue({ kind: 'pipeline', tts: provider } as ReturnType<
          typeof buildModels
        >);
      const runtime = await new AgentRuntimeBuilder(
        metadata({ ttsCacheEnabled: value as boolean }),
      ).build();
      expect(runtime.userData.ttsCache).toBeUndefined();
      expect(provider.listenerCount('error')).toBe(0);
      expect(shared).not.toHaveBeenCalled();
      expect(
        jest.mocked(voice.Agent.create).mock.calls[0][0].ttsNode,
      ).toBeUndefined();
      expect(provider.synthesize).not.toHaveBeenCalled();
      expect(provider.stream).not.toHaveBeenCalled();
      createWorkflowTask(metadata(), {
        instructions: 'Task',
        tools: [],
        userData: runtime.userData,
      });
      expect(
        jest.mocked(voice.AgentTask.create).mock.calls[0][0].ttsNode,
      ).toBeUndefined();
    },
  );
  it('disposes a constructed cache if runtime building fails', async () => {
    const shared = {
      lookup: jest.fn(),
      publish: jest.fn(),
      dispose: jest.fn(),
    };
    jest
      .spyOn(TtsSharedCacheClient, 'create')
      .mockReturnValue(shared as unknown as TtsSharedCacheClient);
    const provider = providerFixture();
    jest
      .mocked(buildModels)
      .mockReturnValue({ kind: 'pipeline', tts: provider } as ReturnType<
        typeof buildModels
      >);
    jest.mocked(buildTools).mockRejectedValue(new Error('tools failed'));
    await expect(new AgentRuntimeBuilder(metadata()).build()).rejects.toThrow(
      'tools failed',
    );
    expect(provider.listenerCount('error')).toBe(0);
    expect(provider.close).not.toHaveBeenCalled();
    expect(shared.dispose).toHaveBeenCalledTimes(1);
  });
  it('supplies actual room and persisted call scope without startup cache HTTP', async () => {
    const shared = {
      lookup: jest.fn(),
      publish: jest.fn(),
      dispose: jest.fn(),
    };
    const create = jest
      .spyOn(TtsSharedCacheClient, 'create')
      .mockReturnValue(shared as unknown as TtsSharedCacheClient);
    const provider = providerFixture();
    jest
      .mocked(buildModels)
      .mockReturnValue({ kind: 'pipeline', tts: provider } as ReturnType<
        typeof buildModels
      >);
    const meta = metadata({
      callId: 'persisted-call',
      organizationId: 'persisted-org',
    });
    const runtime = await new AgentRuntimeBuilder(meta, 'actual-room').build();
    expect(create).toHaveBeenCalledWith(
      meta.callId,
      meta.organizationId,
      'actual-room',
    );
    expect(shared.lookup).not.toHaveBeenCalled();
    expect(shared.publish).not.toHaveBeenCalled();
    const close = jest.mocked(runtime.session.on).mock
      .calls[0][1] as () => void;
    close();
    expect(shared.dispose).toHaveBeenCalledTimes(1);
    expect(provider.close).not.toHaveBeenCalled();
  });
});
