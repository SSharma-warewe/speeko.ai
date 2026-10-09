import { CallFailureCode, CallStatus } from '../call.entity';
import { createCallsHarness, orgAgent, template } from './helpers/calls-mocks';
import { QueueRetryService } from '../../queue/queue-retry.service';

function fixture() {
  const h = createCallsHarness();
  h.organizationAgentsService.getEntityWithTemplate.mockResolvedValue({
    ...orgAgent,
    ttsPreparedSpeechEnabled: true,
    model: null,
    agent: { ...template, model: null },
  });
  let stored = h.makeCall({ status: CallStatus.CREATING });
  h.callsRepository.save.mockImplementation(
    async (row) => (stored = { ...row, id: row.id ?? stored.id }),
  );
  h.callsRepository.findById.mockImplementation(async () => ({ ...stored }));
  h.callsRepository.updateOpeningPreparationUsage.mockImplementation(
    async (row) => {
      stored.usage = row.usage;
    },
  );
  h.livekit.openingPreparationReport.mockImplementation(
    async (_room, _dispatch, attemptId) => ({
      version: 1,
      attemptId,
      status: 'ready',
      usage: { models: [] },
    }),
  );
  return {
    h,
    dial: () => h.dial.dialClaimedCall(h.admitCall(stored)),
    cancel: () => {
      stored.status = CallStatus.CANCELLED;
    },
  };
}

describe('outbound opening preparation gate', () => {
  it('dispatches first and does not submit SIP while opening preparation is pending', async () => {
    const { h, dial } = fixture();
    let release!: () => void;
    let observed!: () => void;
    const preparing = new Promise<void>((resolve) => {
      observed = resolve;
    });
    h.livekit.openingPreparationReport.mockImplementationOnce(
      async (_room, _dispatch, attemptId) => {
        observed();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return {
          version: 1,
          attemptId,
          status: 'ready',
          usage: { models: [] },
        };
      },
    );
    const done = dial();
    await preparing;
    expect(h.livekit.createAgentDispatch).toHaveBeenCalledTimes(1);
    expect(h.livekit.createSipParticipant).not.toHaveBeenCalled();
    const metadata = JSON.parse(
      h.livekit.createAgentDispatch.mock.calls[0][0].metadata,
    );
    expect(metadata.openingPreparation.version).toBe(1);
    release();
    await done;
    expect(h.livekit.createSipParticipant).toHaveBeenCalledTimes(1);
    expect(h.livekit.openingPreparationReport).toHaveBeenCalledTimes(2);
  });

  it('fails without dialing and retains measured usage when preparation fails', async () => {
    const { h, dial } = fixture();
    const usage = { models: [{ type: 'tts_usage', charactersCount: 25 }] };
    h.livekit.openingPreparationReport.mockImplementation(
      async (_r, _d, attemptId) => ({
        version: 1,
        attemptId,
        status: 'failed',
        usage,
      }),
    );
    const call = await dial();
    expect(call?.lastFailureCode).toBe(
      CallFailureCode.OPENING_PREPARATION_FAILED,
    );
    expect(call?.usage).toEqual(usage);
    expect(h.livekit.createSipParticipant).not.toHaveBeenCalled();
    expect(h.livekit.deleteRoom).toHaveBeenCalled();
    expect(h.priceService.applyAttemptToCall).toHaveBeenCalled();
  });

  it('does not overwrite a cancellation or dial after readiness', async () => {
    const { h, dial, cancel } = fixture();
    h.livekit.openingPreparationReport.mockImplementation(
      async (_r, _d, attemptId) => {
        cancel();
        return {
          version: 1,
          attemptId,
          status: 'ready',
          usage: { models: [] },
        };
      },
    );
    expect((await dial())?.status).toBe(CallStatus.CANCELLED);
    expect(h.livekit.createSipParticipant).not.toHaveBeenCalled();
  });

  it.each(['inactive-organization', 'inactive-agent', 'worker-departure'])(
    'fails closed for %s',
    async (scenario) => {
      const { h, dial } = fixture();
      if (scenario === 'inactive-organization')
        h.organizationAgentsService.isOrganizationActive.mockResolvedValue(
          false,
        );
      if (scenario === 'inactive-agent')
        h.organizationAgentsService.getEntityWithTemplate
          .mockResolvedValueOnce({
            ...orgAgent,
            ttsPreparedSpeechEnabled: true,
            agent: template,
          })
          .mockResolvedValueOnce({
            ...orgAgent,
            isActive: false,
            agent: template,
          });
      if (scenario === 'worker-departure')
        h.livekit.openingPreparationReport
          .mockResolvedValueOnce({ status: 'ready', usage: { models: [] } })
          .mockResolvedValueOnce(undefined);
      await dial();
      expect(h.livekit.createSipParticipant).not.toHaveBeenCalled();
    },
  );

  it('times out without dialing when an older worker supplies no readiness', async () => {
    jest.useFakeTimers();
    try {
      const { h, dial } = fixture();
      h.livekit.openingPreparationReport.mockResolvedValue(undefined);
      const done = dial();
      await jest.advanceTimersByTimeAsync(30_001);
      const call = await done;
      expect(call?.lastFailureCode).toBe(
        CallFailureCode.OPENING_PREPARATION_FAILED,
      );
      expect(h.livekit.createSipParticipant).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([false, null])(
    'preserves ungated agents with preparation %s',
    async (preference) => {
      const { h, dial } = fixture();
      h.organizationAgentsService.getEntityWithTemplate.mockResolvedValue({
        ...orgAgent,
        ttsPreparedSpeechEnabled: preference,
        agent: template,
      });
      await dial();
      expect(h.livekit.openingPreparationReport).not.toHaveBeenCalled();
      expect(h.livekit.createSipParticipant).toHaveBeenCalledTimes(1);
    },
  );

  it('never automatically retries preparation failures even if selected in retryOn', () => {
    const h = createCallsHarness();
    const decision = new QueueRetryService().decide({
      call: h.makeCall(),
      settings: {
        retryOn: [CallFailureCode.OPENING_PREPARATION_FAILED],
      } as never,
      failureCode: CallFailureCode.OPENING_PREPARATION_FAILED,
    });
    expect(decision.action).toBe('fail');
  });

  it('also gates an immediate outbound request and returns a clear failure without SIP', async () => {
    const { h } = fixture();
    h.livekit.openingPreparationReport.mockImplementation(
      async (_r, _d, attemptId) => ({
        version: 1,
        attemptId,
        status: 'failed',
        usage: { models: [] },
      }),
    );
    await expect(
      h.dial.createOutboundCall({
        organizationId: orgAgent.organizationId,
        organizationAgentId: orgAgent.id,
        toNumber: '+15551234567',
      }),
    ).rejects.toThrow('call was not placed');
    expect(h.livekit.createSipParticipant).not.toHaveBeenCalled();
    const saved = await h.callsRepository.save.mock.results.at(-1)!.value;
    expect(saved.lastFailureCode).toBe(
      CallFailureCode.OPENING_PREPARATION_FAILED,
    );
  });
});
