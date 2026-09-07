import { isRealtimeLlmModel } from '@call-agent/contracts';
import type { AgentJobMetadata } from '../job-metadata';
import { finishWorkflowTask } from '../builders/workflow-task';
import { speakRealtimeGoodbye } from '../builders/realtime-speech';

jest.mock('../builders/realtime-speech', () => ({
  speakRealtimeOpening: jest.fn().mockResolvedValue(undefined),
  speakRealtimeGoodbye: jest.fn().mockResolvedValue(undefined),
}));

const speakGoodbye = speakRealtimeGoodbye as jest.MockedFunction<
  typeof speakRealtimeGoodbye
>;

function meta(
  overrides: Partial<AgentJobMetadata> = {},
): AgentJobMetadata {
  return {
    agentKey: 'outbound',
    direction: 'outbound',
    task: 'general',
    prompt: {
      systemPrompt: 'You are a test agent.',
      onEnterInstructions: null,
      onExitInstructions: null,
    },
    enabledTools: ['endCall'],
    ...overrides,
  };
}

describe('finishWorkflowTask', () => {
  beforeEach(() => {
    speakGoodbye.mockClear();
    speakGoodbye.mockResolvedValue(undefined);
  });

  it('speaks goodbye then completes on realtime', async () => {
    expect(isRealtimeLlmModel('xai/grok-voice-think-fast-2.0')).toBe(true);
    const complete = jest.fn();
    const session = { generateReply: jest.fn() };
    const task = { session, complete } as never;
    const result = { outcome: 'PROMISED' };

    await finishWorkflowTask(
      task,
      meta({ model: 'xai/grok-voice-think-fast-2.0' }),
      result,
    );

    expect(speakGoodbye).toHaveBeenCalledWith(session, expect.anything());
    expect(complete).toHaveBeenCalledWith(result);
    expect(speakGoodbye.mock.invocationCallOrder[0]).toBeLessThan(
      complete.mock.invocationCallOrder[0],
    );
  });

  it('still completes if goodbye throws', async () => {
    speakGoodbye.mockRejectedValue(new Error('Item not found'));
    const complete = jest.fn();
    const task = {
      session: { generateReply: jest.fn() },
      complete,
    } as never;

    await expect(
      finishWorkflowTask(
        task,
        meta({ model: 'xai/grok-voice-think-fast-2.0' }),
        { ok: true },
      ),
    ).resolves.toBeUndefined();
    expect(complete).toHaveBeenCalledWith({ ok: true });
  });

  it('skips goodbye on pipeline and still completes', async () => {
    const complete = jest.fn();
    const task = { session: {}, complete } as never;

    await finishWorkflowTask(task, meta(), { ok: true });

    expect(speakGoodbye).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith({ ok: true });
  });
});
