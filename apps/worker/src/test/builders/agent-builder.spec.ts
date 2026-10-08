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
import type { AgentJobMetadata } from '../../session/job-metadata';
import { AgentRuntimeBuilder } from '../../builders/agent-builder';
import { buildModels } from '../../builders/model-builder';
import { buildAgentSession } from '../../builders/voice-builder';
import { buildTools } from '../../builders/tool-builder';
import { createWorkflowTask } from '../../tasks/workflow-task';
import { TtsSharedCacheClient } from '../../speech/tts-shared-cache-client';
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
