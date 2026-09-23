import type { AgentJobMetadata } from '../../session/job-metadata';
import { callCalendarApi } from '../../tools/calendar-api-client';
import type { SessionUserData } from '../../tools/types';
import {
  awaitDemoCrmPrefetch,
  enqueueDemoCrm,
  shouldPrefetchDemoCrm,
  startDemoCrmPrefetch,
} from '../../tasks/demo-booking-crm';

jest.mock('../../tools/calendar-api-client', () => ({
  callCalendarApi: jest.fn(),
}));

const callApi = callCalendarApi as jest.MockedFunction<typeof callCalendarApi>;

function meta(
  overrides: Partial<AgentJobMetadata> = {},
): AgentJobMetadata {
  return {
    agentKey: 'outbound',
    direction: 'outbound',
    task: 'demo_booking',
    prompt: {
      systemPrompt: 'You are a test agent.',
      onEnterInstructions: null,
      onExitInstructions: null,
    },
    enabledTools: [
      'endCall',
      'lookupGhlContact',
      'upsertGhlContact',
      'scheduleGhlMeeting',
    ],
    ...overrides,
  };
}

function userData(
  extras: Partial<SessionUserData> = {},
): SessionUserData {
  return {
    callId: 'call-1',
    context: { email: 'ada@example.com', customerName: 'Ada' },
    taskResult: null,
    taskCompleted: false,
    toolEvents: [],
    ...extras,
  };
}

describe('shouldPrefetchDemoCrm', () => {
  it('requires outbound demo, GHL CRM tools, callId, and email or phone', () => {
    expect(shouldPrefetchDemoCrm(meta(), userData())).toBe(true);
    expect(
      shouldPrefetchDemoCrm(meta({ task: 'interview_booking' }), userData()),
    ).toBe(false);
    expect(
      shouldPrefetchDemoCrm(meta({ enabledTools: ['endCall'] }), userData()),
    ).toBe(false);
    expect(
      shouldPrefetchDemoCrm(
        meta(),
        userData({ context: { ghlContactId: 'con_1', email: 'a@b.c' } }),
      ),
    ).toBe(false);
    expect(
      shouldPrefetchDemoCrm(meta(), userData({ callId: undefined })),
    ).toBe(false);
    expect(
      shouldPrefetchDemoCrm(meta(), userData({ context: {} })),
    ).toBe(false);
  });
});

describe('startDemoCrmPrefetch', () => {
  beforeEach(() => {
    callApi.mockReset();
  });

  it('looks up then stores ghlContactId', async () => {
    callApi.mockResolvedValue({
      ok: true,
      data: { found: true, contactId: 'con_9' },
    });
    const data = userData();
    startDemoCrmPrefetch(meta(), data);
    await awaitDemoCrmPrefetch(data);
    expect(callApi).toHaveBeenCalledWith(
      'call-1',
      'contacts/lookup',
      { participantEmail: 'ada@example.com' },
      expect.objectContaining({ toolId: 'lookupGhlContact' }),
    );
    expect(data.context.ghlContactId).toBe('con_9');
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('upserts when lookup misses', async () => {
    callApi
      .mockResolvedValueOnce({
        ok: true,
        data: { found: false },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { contactId: 'con_new' },
      });
    const data = userData();
    startDemoCrmPrefetch(meta(), data);
    await awaitDemoCrmPrefetch(data);
    expect(callApi).toHaveBeenNthCalledWith(
      2,
      'call-1',
      'contacts',
      expect.objectContaining({
        participantEmail: 'ada@example.com',
        participantName: 'Ada',
      }),
      expect.objectContaining({ toolId: 'upsertGhlContact' }),
    );
    expect(data.context.ghlContactId).toBe('con_new');
  });

  it('does not start when the gate fails', () => {
    const data = userData({ context: { ghlContactId: 'already' } });
    startDemoCrmPrefetch(meta(), data);
    expect(data.crmPrefetch).toBeUndefined();
    expect(callApi).not.toHaveBeenCalled();
  });
});

describe('enqueueDemoCrm', () => {
  it('chains work and awaitDemoCrmPrefetch swallows errors', async () => {
    const data = userData();
    enqueueDemoCrm(data, async () => {
      throw new Error('crm down');
    });
    await expect(awaitDemoCrmPrefetch(data)).resolves.toBeUndefined();
  });
});
