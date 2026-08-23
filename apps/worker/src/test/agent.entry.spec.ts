jest.mock('@livekit/agents', () => ({
  defineAgent: (def: { entry: unknown }) => def,
  voice: { AgentSessionEventTypes: { Close: 'close' } },
}));

jest.mock('../builders/agent-builder', () => ({
  buildAgentRuntime: jest.fn(),
}));

jest.mock('../sip-answer', () => {
  const actual = jest.requireActual('../sip-answer') as Record<string, unknown>;
  return {
    ...actual,
    waitForSipAnswer: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('../call-callback', () => {
  const actual = jest.requireActual('../call-callback') as Record<string, unknown>;
  return {
    ...actual,
    postCallComplete: jest.fn().mockResolvedValue(undefined),
  };
});

import type { JobContext } from '@livekit/agents';
import { runAgentJob } from '../agent';
import { buildAgentRuntime } from '../builders/agent-builder';
import { postCallComplete } from '../call-callback';
import type { CompleteCallPayload } from '../call-callback';
import type { AgentJobMetadata } from '../job-metadata';
import { waitForSipAnswer } from '../sip-answer';
import type { SessionUserData } from '../tools/types';

/**
 * Pure unit tests for the LiveKit job entry (`runAgentJob`).
 * Real SIP wait / voice session / API callback are mocked; delays stand in for dialing.
 */
describe('runAgentJob', () => {
  const DIAL_DELAY_MS = 80;
  const CALL_ID = 'call-1';
  const PHONE = '+15551212';

  const buildAgentRuntimeMock = buildAgentRuntime as jest.MockedFunction<
    typeof buildAgentRuntime
  >;
  const waitForSipAnswerMock = waitForSipAnswer as jest.MockedFunction<
    typeof waitForSipAnswer
  >;
  const postCallCompleteMock = postCallComplete as jest.MockedFunction<
    typeof postCallComplete
  >;

  type ShutdownCb = () => Promise<void> | void;

  type FakeSession = {
    start: jest.Mock;
    on: jest.Mock;
    history: { toJSON: () => { items: unknown[] } };
    usage: { modelUsage: unknown[] };
  };

  type FakeRuntime = {
    session: FakeSession;
    agent: Record<string, unknown>;
    userData: SessionUserData;
  };

  type FakeJobContext = {
    job: { metadata: string; room: { name: string } };
    room: Record<string, unknown>;
    connect: jest.Mock;
    waitForParticipant: jest.Mock;
    addShutdownCallback: (cb: ShutdownCb) => void;
    makeSessionReport: jest.Mock;
    shutdown: jest.Mock;
    runShutdown: () => Promise<void>;
  };

  let runtime: FakeRuntime;

  function metadata(
    overrides: Partial<AgentJobMetadata> = {},
  ): AgentJobMetadata {
    return {
      callId: CALL_ID,
      organizationId: 'org-1',
      agentKey: 'outbound',
      direction: 'outbound',
      medium: 'sip',
      task: 'general',
      prompt: { systemPrompt: 'You are a test agent.' },
      enabledTools: ['endCall'],
      participantIdentity: PHONE,
      ...overrides,
    };
  }

  function makeParticipant(identity = PHONE) {
    return {
      identity,
      attributes: { 'sip.callStatus': 'ringing' },
    };
  }

  function makeRuntime(
    meta: AgentJobMetadata,
    extras: Partial<SessionUserData> = {},
  ): FakeRuntime {
    const userData: SessionUserData = {
      callId: meta.callId,
      organizationId: meta.organizationId,
      taskKey: meta.task,
      context: meta.context ?? {},
      taskResult: null,
      taskCompleted: false,
      toolEvents: [],
      ...extras,
    };
    return {
      session: {
        start: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        history: {
          toJSON: () => ({
            items: [
              { role: 'assistant', content: 'Hello', id: 't1' },
            ],
          }),
        },
        usage: { modelUsage: [{ model: 'test', tokens: 1 }] },
      },
      agent: {},
      userData,
    };
  }

  function makeCtx(
    meta: AgentJobMetadata,
    roomName = `room-${meta.callId ?? 'x'}`,
  ): FakeJobContext {
    const shutdownCbs: ShutdownCb[] = [];
    return {
      job: {
        metadata: JSON.stringify(meta),
        room: { name: roomName },
      },
      room: { name: roomName },
      connect: jest.fn().mockResolvedValue(undefined),
      waitForParticipant: jest.fn().mockResolvedValue(makeParticipant(meta.participantIdentity)),
      addShutdownCallback: (cb) => {
        shutdownCbs.push(cb);
      },
      makeSessionReport: jest.fn().mockReturnValue({ ok: true }),
      shutdown: jest.fn(),
      runShutdown: async () => {
        for (const cb of shutdownCbs) {
          await cb();
        }
      },
    };
  }

  async function runJob(ctx: FakeJobContext): Promise<void> {
    await runAgentJob(ctx as unknown as JobContext);
    await ctx.runShutdown();
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function completedCalls(): Array<{
    callId: string;
    payload: CompleteCallPayload;
  }> {
    return postCallCompleteMock.mock.calls.map(([callId, payload]) => ({
      callId,
      payload,
    }));
  }

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();

    runtime = makeRuntime(metadata());
    buildAgentRuntimeMock.mockImplementation(async (meta) => {
      runtime = makeRuntime(meta);
      return runtime as never;
    });
    waitForSipAnswerMock.mockResolvedValue(undefined);
    postCallCompleteMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Medium gate (feature-flag analogue)
  // ---------------------------------------------------------------------------
  describe('1. Medium gate', () => {
    it('skips SIP wait for web jobs and still starts the session', async () => {
      const ctx = makeCtx(metadata({ medium: 'web' }));

      await runJob(ctx);

      expect(ctx.waitForParticipant).not.toHaveBeenCalled();
      expect(waitForSipAnswerMock).not.toHaveBeenCalled();
      expect(runtime.session.start).toHaveBeenCalledTimes(1);
    });

    it('skips SIP wait when medium is omitted', async () => {
      const ctx = makeCtx(metadata({ medium: undefined }));

      await runJob(ctx);

      expect(ctx.waitForParticipant).not.toHaveBeenCalled();
      expect(waitForSipAnswerMock).not.toHaveBeenCalled();
      expect(runtime.session.start).toHaveBeenCalledTimes(1);
    });

    it('waits for SIP participant then answer before starting the session', async () => {
      const ctx = makeCtx(metadata({ medium: 'sip' }));

      await runJob(ctx);

      expect(ctx.waitForParticipant).toHaveBeenCalledWith(PHONE);
      expect(waitForSipAnswerMock).toHaveBeenCalledTimes(1);
      expect(runtime.session.start).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Shutdown mutex (failedEarly)
  // ---------------------------------------------------------------------------
  describe('2. Shutdown mutex (failedEarly)', () => {
    it('does not POST a second complete from shutdown after an unanswered SIP fail', async () => {
      waitForSipAnswerMock.mockRejectedValue(
        new Error('SIP callee did not answer (timeout after 60000ms)'),
      );
      const ctx = makeCtx(metadata({ medium: 'sip' }));

      await runJob(ctx);

      expect(postCallCompleteMock).toHaveBeenCalledTimes(1);
      expect(postCallCompleteMock).toHaveBeenCalledWith(
        CALL_ID,
        expect.objectContaining({
          status: 'failed',
          failureCode: 'no_answer',
          taskCompleted: false,
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. SIP wait then session start (one job at a time)
  // ---------------------------------------------------------------------------
  describe('3. SIP wait vs session start', () => {
    it('runs waitForSipAnswer to completion before session.start', async () => {
      const order: string[] = [];
      waitForSipAnswerMock.mockImplementation(async () => {
        order.push('wait');
      });
      buildAgentRuntimeMock.mockImplementation(async (meta) => {
        runtime = makeRuntime(meta);
        runtime.session.start.mockImplementation(async () => {
          order.push('start');
        });
        return runtime as never;
      });
      const ctx = makeCtx(metadata({ medium: 'sip' }));

      await runJob(ctx);

      expect(order).toEqual(['wait', 'start']);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Happy path
  // ---------------------------------------------------------------------------
  describe('4. Happy path', () => {
    it('answers SIP, starts the session, and shutdown POSTs completed with answeredAt', async () => {
      buildAgentRuntimeMock.mockImplementation(async (meta) => {
        runtime = makeRuntime(meta, {
          taskCompleted: true,
          taskResult: { task: 'general', outcome: 'COMPLETED' },
        });
        return runtime as never;
      });
      const ctx = makeCtx(metadata({ medium: 'sip' }));

      await runJob(ctx);

      expect(ctx.connect).toHaveBeenCalled();
      expect(ctx.waitForParticipant).toHaveBeenCalledWith(PHONE);
      expect(waitForSipAnswerMock).toHaveBeenCalled();
      expect(runtime.session.start).toHaveBeenCalledWith({
        agent: runtime.agent,
        room: ctx.room,
      });
      expect(postCallCompleteMock).toHaveBeenCalledTimes(1);
      const payload = postCallCompleteMock.mock.calls[0][1];
      expect(payload.status).toBe('completed');
      expect(payload.taskCompleted).toBe(true);
      expect(payload.answeredAt).toEqual(expect.any(String));
      expect(payload.failureCode).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Critical safety path
  // ---------------------------------------------------------------------------
  describe('5. Critical safety path', () => {
    it('POSTs failed/no_answer and never starts the session when SIP wait rejects', async () => {
      waitForSipAnswerMock.mockRejectedValue(
        new Error('SIP callee hung up before answer (no answer)'),
      );
      const ctx = makeCtx(metadata({ medium: 'sip' }));

      await runJob(ctx);

      expect(runtime.session.start).not.toHaveBeenCalled();
      expect(postCallCompleteMock).toHaveBeenCalledTimes(1);
      expect(postCallCompleteMock.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          status: 'failed',
          failureCode: 'no_answer',
          taskCompleted: false,
          taskResult: { task: 'general', outcome: 'NO_ANSWER' },
        }),
      );
      expect(postCallCompleteMock.mock.calls[0][1].answeredAt).toBeUndefined();
      expect(ctx.shutdown).toHaveBeenCalledWith('agent_error');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Error isolation
  // ---------------------------------------------------------------------------
  describe('6. Error isolation', () => {
    it('POSTs agent_error when a web job fails to connect (no SIP wait)', async () => {
      const ctx = makeCtx(metadata({ medium: 'web' }));
      ctx.connect.mockRejectedValue(new Error('livekit down'));

      await runJob(ctx);

      expect(ctx.waitForParticipant).not.toHaveBeenCalled();
      expect(waitForSipAnswerMock).not.toHaveBeenCalled();
      expect(runtime.session.start).not.toHaveBeenCalled();
      expect(postCallCompleteMock).toHaveBeenCalledWith(
        CALL_ID,
        expect.objectContaining({
          status: 'failed',
          failureCode: 'agent_error',
          taskCompleted: false,
          taskResult: { task: 'general', outcome: 'AGENT_ERROR' },
        }),
      );
    });

    it('POSTs agent_error (not no_answer) when session.start throws after SIP answer', async () => {
      buildAgentRuntimeMock.mockImplementation(async (meta) => {
        runtime = makeRuntime(meta);
        runtime.session.start.mockRejectedValue(new Error('session exploded'));
        return runtime as never;
      });
      const ctx = makeCtx(metadata({ medium: 'sip' }));

      await runJob(ctx);

      expect(waitForSipAnswerMock).toHaveBeenCalled();
      expect(postCallCompleteMock).toHaveBeenCalledTimes(1);
      const payload = postCallCompleteMock.mock.calls[0][1];
      expect(payload.status).toBe('failed');
      expect(payload.failureCode).toBe('agent_error');
      expect(payload.answeredAt).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Callback contract
  // ---------------------------------------------------------------------------
  describe('7. Callback contract', () => {
    it('shutdown POST includes status, answeredAt, endedAt, transcript, usage, taskCompleted, toolEvents', async () => {
      buildAgentRuntimeMock.mockImplementation(async (meta) => {
        runtime = makeRuntime(meta, {
          taskCompleted: true,
          taskResult: { task: 'general', outcome: 'COMPLETED' },
          toolEvents: [
            {
              at: '2026-08-23T00:00:00.000Z',
              toolId: 'endCall',
              ok: true,
            },
          ],
        });
        return runtime as never;
      });
      const ctx = makeCtx(metadata({ medium: 'sip' }));

      await runJob(ctx);

      expect(postCallCompleteMock).toHaveBeenCalledTimes(1);
      const [callId, payload] = postCallCompleteMock.mock.calls[0];
      expect(callId).toBe(CALL_ID);
      expect(payload.status).toBe('completed');
      expect(payload.answeredAt).toEqual(expect.any(String));
      expect(payload.endedAt).toEqual(expect.any(String));
      expect(payload.transcript).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'assistant', content: 'Hello' }),
        ]),
      );
      expect(payload.usage).toEqual({
        models: [{ model: 'test', tokens: 1 }],
      });
      expect(payload.taskCompleted).toBe(true);
      expect(payload.toolEvents).toEqual([
        expect.objectContaining({ toolId: 'endCall', ok: true }),
      ]);
      expect(payload.sessionReport).toEqual({ ok: true });
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Feeding 30 jobs one-by-one with timeout
  // ---------------------------------------------------------------------------
  describe('8. Feeding 30 jobs with timeout', () => {
    const JOB_COUNT = 30;
    const NO_ANSWER_IDS = new Set(['call-10', 'call-20', 'call-30']);

    function jobId(n: number): string {
      return `call-${String(n).padStart(2, '0')}`;
    }

    it('processes 30 SIP jobs serially, delays stand in for dial/session, each callId completes once', async () => {
      jest.useFakeTimers();

      let inWait = false;
      let inStart = false;
      let overlap = 0;
      const waitStarted: string[] = [];
      const sessionStarted: string[] = [];
      const inFlight: string[] = [];

      waitForSipAnswerMock.mockImplementation(async (input) => {
        const id = input.participant.identity;
        if (inStart || inWait) {
          overlap += 1;
        }
        inWait = true;
        inFlight.push(`wait:${id}`);
        waitStarted.push(id);
        try {
          await delay(DIAL_DELAY_MS);
          if (NO_ANSWER_IDS.has(id)) {
            throw new Error(`SIP callee did not answer (timeout) id=${id}`);
          }
        } finally {
          inWait = false;
          const idx = inFlight.indexOf(`wait:${id}`);
          if (idx >= 0) {
            inFlight.splice(idx, 1);
          }
        }
      });

      buildAgentRuntimeMock.mockImplementation(async (meta) => {
        const built = makeRuntime(meta, {
          taskCompleted: true,
          taskResult: { task: 'general', outcome: 'COMPLETED' },
        });
        built.session.start.mockImplementation(async () => {
          const id = meta.callId ?? 'unknown';
          if (inWait || inStart) {
            overlap += 1;
          }
          inStart = true;
          inFlight.push(`start:${id}`);
          sessionStarted.push(id);
          try {
            await delay(DIAL_DELAY_MS);
          } finally {
            inStart = false;
            const idx = inFlight.indexOf(`start:${id}`);
            if (idx >= 0) {
              inFlight.splice(idx, 1);
            }
          }
        });
        return built as never;
      });

      for (let n = 1; n <= JOB_COUNT; n += 1) {
        const id = jobId(n);
        const ctx = makeCtx(
          metadata({
            callId: id,
            medium: 'sip',
            participantIdentity: id,
          }),
        );
        const pending = runJob(ctx);
        await jest.runAllTimersAsync();
        await pending;
      }

      expect(overlap).toBe(0);
      expect(inFlight).toEqual([]);
      expect(waitStarted).toHaveLength(JOB_COUNT);
      expect(waitStarted).toEqual(
        Array.from({ length: JOB_COUNT }, (_, i) => jobId(i + 1)),
      );

      const posts = completedCalls();
      expect(posts).toHaveLength(JOB_COUNT);
      expect(new Set(posts.map((p) => p.callId)).size).toBe(JOB_COUNT);

      const unanswered = posts.filter((p) => NO_ANSWER_IDS.has(p.callId));
      const answered = posts.filter((p) => !NO_ANSWER_IDS.has(p.callId));

      expect(unanswered).toHaveLength(3);
      for (const row of unanswered) {
        expect(row.payload.status).toBe('failed');
        expect(row.payload.failureCode).toBe('no_answer');
        expect(row.payload.taskCompleted).toBe(false);
        expect(sessionStarted).not.toContain(row.callId);
      }

      expect(answered).toHaveLength(27);
      expect(sessionStarted).toHaveLength(27);
      for (const row of answered) {
        expect(row.payload.status).toBe('completed');
        expect(row.payload.taskCompleted).toBe(true);
        expect(row.payload.answeredAt).toEqual(expect.any(String));
      }

      expect(sessionStarted).not.toEqual(
        expect.arrayContaining([...NO_ANSWER_IDS]),
      );
    });

    it('continues later jobs when one session.start throws', async () => {
      jest.useFakeTimers();

      waitForSipAnswerMock.mockImplementation(async () => {
        await delay(DIAL_DELAY_MS);
      });
      buildAgentRuntimeMock.mockImplementation(async (meta) => {
        const built = makeRuntime(meta, { taskCompleted: true });
        built.session.start.mockImplementation(async () => {
          await delay(DIAL_DELAY_MS);
          if (meta.callId === 'call-05') {
            throw new Error('session boom on call-05');
          }
        });
        return built as never;
      });

      for (let n = 1; n <= 8; n += 1) {
        const id = jobId(n);
        const ctx = makeCtx(
          metadata({
            callId: id,
            medium: 'sip',
            participantIdentity: id,
          }),
        );
        const pending = runJob(ctx);
        await jest.runAllTimersAsync();
        await pending;
      }

      const posts = completedCalls();
      expect(posts).toHaveLength(8);
      expect(posts.map((p) => p.callId)).toEqual([
        'call-01',
        'call-02',
        'call-03',
        'call-04',
        'call-05',
        'call-06',
        'call-07',
        'call-08',
      ]);
      const failed = posts.find((p) => p.callId === 'call-05');
      expect(failed?.payload.failureCode).toBe('agent_error');
      expect(
        posts.filter((p) => p.callId !== 'call-05').every((p) => p.payload.status === 'completed'),
      ).toBe(true);
    });
  });
});
