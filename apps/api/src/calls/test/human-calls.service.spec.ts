import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ParticipantInfo, TrackInfo, TrackSource } from '@livekit/protocol';
import { Call, CallStatus, CallTaskStatus } from '../call.entity';
import { HumanCallSession } from '../human-call-session.entity';
import { HumanCallsService } from '../services/human-calls.service';
import {
  humanContactPhone,
  humanMicrophoneReady,
  humanSipAnswered,
} from '../lib/human-call';
import { applyCallEvent, CallLifecycleEvent } from '../lib/call-state-machine';
import { newCallRow } from '../lib/call-row';
import { toCallResponse } from '../mappers/call-response.mapper';
import { priceAttempt } from '../../price/price.calculator';

const actor = {
  typ: 'user' as const,
  id: 'user',
  orgId: 'org',
  name: 'Operator',
  email: 'operator@example.com',
  role: 'agent',
};
const request = {
  crmIntegrationId: 'crm',
  crmContactId: 'contact',
  sipTrunkId: 'trunk',
  requestId: 'request',
};
const browser = (muted = false) =>
  new ParticipantInfo({
    identity: 'browser',
    tracks: [new TrackInfo({ source: TrackSource.MICROPHONE, muted })],
  });
const sip = (status = 'active') =>
  new ParticipantInfo({
    identity: 'sip',
    attributes: { 'sip.callStatus': status },
  });

function harness() {
  const call = {
    ...newCallRow({
      id: 'call',
      executionType: 'human',
      organizationId: 'org',
      direction: 'outbound',
      medium: 'sip',
      status: 'creating',
      taskStatus: 'not_applicable',
      roomName: 'room',
      fromNumber: '+919876543210',
      toNumber: '+919123456789',
    }),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Call;
  const session = {
    id: 'session',
    callId: call.id,
    organizationId: 'org',
    userId: 'user',
    call,
    callerName: 'Operator',
    contactName: 'Contact',
    crmIntegrationId: 'crm',
    crmContactId: 'contact',
    requestId: 'request',
    selection: {
      crmIntegrationId: 'crm',
      crmContactId: 'contact',
      sipTrunkId: 'trunk',
    },
    browserIdentity: 'browser',
    sipIdentity: 'sip',
    phase: 'waiting_for_user',
    joinDeadline: new Date(Date.now() + 120000),
    roomReadyAt: new Date(),
    dialAttemptedAt: null,
    dialSettledAt: null,
    browserJoinedAt: null,
    browserMissingSince: null,
    endReason: null,
    terminalStatus: null,
    cleanupStartedAt: null,
    finishedAt: null,
    leaseToken: 'lease',
    leaseUntil: new Date(Date.now() + 30000),
  } as HumanCallSession;
  const sessions = {
    findRequest: jest.fn().mockResolvedValue(null),
    findActive: jest.fn().mockResolvedValue(session),
    find: jest.fn().mockResolvedValue(session),
    owned: jest.fn().mockResolvedValue(session),
    actorActive: jest.fn().mockResolvedValue(true),
    claimDue: jest.fn(async () => (session.finishedAt ? [] : [session])),
    release: jest.fn(),
    mutate: jest.fn(async (_id, _token, action) => {
      if (!session.finishedAt) action(session, call);
      return session;
    }),
    create: jest.fn(async (_actor, _request, prepared) => {
      Object.assign(call, prepared);
      session.phase = 'preparing';
      return { session, created: true };
    }),
  };
  const calls = { create: jest.fn((value) => value), updateCost: jest.fn() };
  const crm = {
    execute: jest
      .fn()
      .mockResolvedValue({
        contact: { firstName: 'Contact', phone: '+919123456789' },
      }),
  };
  const livekit = {
    observeHumanRoom: jest.fn().mockResolvedValue([]),
    createHumanRoom: jest.fn(),
    deleteHumanRoom: jest.fn(),
    createHumanParticipantToken: jest.fn().mockResolvedValue('token'),
    buildMeetUrl: jest.fn().mockReturnValue('meet-url'),
    createSipParticipant: jest.fn().mockResolvedValue({ sipCallId: 'sip-id' }),
  };
  const trunks = {
    resolveOutboundForCall: jest
      .fn()
      .mockResolvedValue({
        id: 'trunk',
        livekitTrunkId: 'ST_trunk',
        numbers: ['+919876543210'],
        krispEnabled: false,
      }),
  };
  const admission = {
    admitImmediate: jest.fn(async () => {
      applyCallEvent(
        call,
        CallLifecycleEvent.HUMAN_DIAL_STARTED,
        CallStatus.DIALING,
      );
      session.phase = 'dialing';
      session.dialAttemptedAt = new Date();
    }),
  };
  const settings = { getOrCreate: jest.fn() };
  const config = { get: jest.fn().mockReturnValue(true) };
  const price = { fillCostIfMissing: jest.fn() };
  const service = new HumanCallsService(
    sessions as never,
    calls as never,
    crm as never,
    livekit as never,
    trunks as never,
    admission as never,
    settings as never,
    config as never,
    price as never,
  );
  return {
    service,
    session,
    call,
    sessions,
    calls,
    crm,
    livekit,
    admission,
    config,
    price,
  };
}

describe('Human CRM calls', () => {
  it.each(['+919123456789', '(912) 345-6789', '09123456789'])(
    'normalizes usable phones: %s',
    (phone) => expect(humanContactPhone({ phone })).toBe('+919123456789'),
  );
  it.each(['', '+abc', '123456', '++919123456789', '+019123456789'])(
    'rejects invalid phones: %s',
    (phone) =>
      expect(() => humanContactPhone({ phone })).toThrow(BadRequestException),
  );
  it('blocks global and call-specific DND', () => {
    expect(() =>
      humanContactPhone({ phone: '+919123456789', dnd: true }),
    ).toThrow();
    expect(() =>
      humanContactPhone({
        phone: '+919123456789',
        dndSettings: { Call: { status: 'active' } },
      }),
    ).toThrow();
    expect(
      humanContactPhone({
        phone: '+919123456789',
        dndSettings: { SMS: { status: 'active' } },
      }),
    ).toBe('+919123456789');
  });
  it('requires an unmuted microphone; SIP presence alone is not answer', () => {
    expect(humanMicrophoneReady(browser(true))).toBe(false);
    expect(humanMicrophoneReady(browser())).toBe(true);
    expect(humanSipAnswered(sip('ringing'))).toBe(false);
    expect(humanSipAnswered(sip())).toBe(true);
  });
  it('creates only a human room and browser credentials, using server-resolved contact', async () => {
    const h = harness();
    const result = await h.service.create(actor, request);
    expect(h.livekit.createHumanRoom).toHaveBeenCalledTimes(1);
    expect(h.livekit.createSipParticipant).not.toHaveBeenCalled();
    expect(result.meetUrl).toBe('meet-url');
    expect(result.call).toMatchObject({
      executionType: 'human',
      agentId: null,
      taskKey: null,
      taskStatus: 'not_applicable',
      toNumber: '+919123456789',
    });
    expect(h.crm.execute).toHaveBeenCalledWith('org', 'crm', {
      action: 'contacts.get',
      params: { id: 'contact' },
    });
  });
  it('feature disable blocks new creates but retains active/end/join operations', async () => {
    const h = harness();
    h.config.get.mockReturnValue(false);
    await expect(h.service.create(actor, request)).rejects.toThrow(
      'not enabled',
    );
    expect((await h.service.active(actor)).enabled).toBe(false);
    expect((await h.service.join(actor, 'call')).meetUrl).toBe('meet-url');
    await h.service.end(actor, 'call');
    expect(h.session.phase).toBe('ending');
  });
  it('same request replays without a second room; conflicting selections are rejected', async () => {
    const h = harness();
    h.sessions.findRequest.mockResolvedValue(h.session);
    await h.service.create(actor, request);
    expect(h.livekit.createHumanRoom).not.toHaveBeenCalled();
    await expect(
      h.service.create(actor, { ...request, sipTrunkId: 'other' }),
    ).rejects.toThrow(ConflictException);
    await expect(
      h.service.create({ ...actor, id: 'another' }, request),
    ).rejects.toThrow(ConflictException);
  });
  it('does not dial before microphone readiness or reserve admission for waiting users', async () => {
    const h = harness();
    h.livekit.observeHumanRoom.mockResolvedValue([browser(true)]);
    await h.service.tick();
    expect(h.admission.admitImmediate).not.toHaveBeenCalled();
    expect(h.livekit.createSipParticipant).not.toHaveBeenCalled();
  });
  it('revalidates microphone and contact before atomically admitting exactly one dial', async () => {
    const h = harness();
    h.livekit.observeHumanRoom.mockResolvedValue([browser()]);
    await h.service.tick();
    await h.service.tick();
    expect(h.admission.admitImmediate).toHaveBeenCalledWith('org', 'call', {
      sessionId: 'session',
      leaseToken: 'lease',
    });
    expect(h.livekit.createSipParticipant).toHaveBeenCalledTimes(1);
    expect(h.livekit.createSipParticipant).toHaveBeenCalledWith(
      expect.objectContaining({
        humanCall: true,
        waitUntilAnswered: false,
        phoneNumber: '+919123456789',
        participantIdentity: 'sip',
      }),
    );
  });
  it('capacity denial terminates prepared call and never submits SIP', async () => {
    const h = harness();
    h.livekit.observeHumanRoom.mockResolvedValue([browser()]);
    h.admission.admitImmediate.mockRejectedValue(
      new ConflictException('capacity'),
    );
    await h.service.tick();
    expect(h.session).toMatchObject({
      phase: 'ending',
      endReason: 'admission_denied',
    });
    expect(h.livekit.createSipParticipant).not.toHaveBeenCalled();
  });
  it('changed destination requires a new call instead of silently dialing another number', async () => {
    const h = harness();
    h.livekit.observeHumanRoom.mockResolvedValue([browser()]);
    h.crm.execute.mockResolvedValue({ contact: { phone: '+919999999999' } });
    await h.service.tick();
    expect(h.livekit.createSipParticipant).not.toHaveBeenCalled();
    expect(h.session.phase).toBe('ending');
  });
  it('ambiguous SIP write and API restart observation never repeat the dial', async () => {
    const h = harness();
    h.livekit.observeHumanRoom.mockResolvedValue([browser()]);
    h.livekit.createSipParticipant.mockRejectedValue(new Error('timeout'));
    await h.service.tick();
    await h.service.tick();
    await h.service.tick();
    expect(h.livekit.createSipParticipant).toHaveBeenCalledTimes(1);
    h.livekit.observeHumanRoom.mockResolvedValue([browser(), sip()]);
    await h.service.tick();
    expect(h.call.answeredAt).toBeInstanceOf(Date);
  });
  it('observation failure neither starts disconnect grace nor claims termination', async () => {
    const h = harness();
    h.session.phase = 'connected';
    h.call.status = CallStatus.READY;
    h.call.answeredAt = new Date();
    h.livekit.observeHumanRoom.mockRejectedValue(new Error('offline'));
    await h.service.tick();
    expect(h.session.browserMissingSince).toBeNull();
    expect(h.session.phase).toBe('connected');
  });
  it('muting during connected call stays connected', async () => {
    const h = harness();
    h.session.phase = 'connected';
    h.call.status = CallStatus.READY;
    h.call.answeredAt = new Date();
    h.livekit.observeHumanRoom.mockResolvedValue([browser(true), sip()]);
    await h.service.tick();
    expect(h.session.phase).toBe('connected');
  });
  it('allows reconnect within grace and ends after 15 seconds missing', async () => {
    const h = harness();
    h.session.phase = 'connected';
    h.call.status = CallStatus.READY;
    h.call.answeredAt = new Date();
    h.livekit.observeHumanRoom.mockResolvedValue([sip()]);
    await h.service.tick();
    expect(h.session.phase).toBe('reconnecting');
    h.livekit.observeHumanRoom.mockResolvedValue([browser(), sip()]);
    await h.service.tick();
    expect(h.session.phase).toBe('connected');
    expect(h.session.browserMissingSince).toBeNull();
    h.session.browserMissingSince = new Date(Date.now() - 15001);
    h.livekit.observeHumanRoom.mockResolvedValue([sip()]);
    await h.service.tick();
    expect(h.session.phase).toBe('ending');
  });
  it('expires join and answer deadlines without retrying', async () => {
    const h = harness();
    h.session.joinDeadline = new Date(Date.now() - 1);
    await h.service.tick();
    expect(h.session.endReason).toBe('join_timeout');
    const dialing = harness();
    dialing.session.phase = 'dialing';
    dialing.call.status = CallStatus.DIALING;
    dialing.session.dialAttemptedAt = new Date(Date.now() - 60001);
    await dialing.service.tick();
    expect(dialing.session.endReason).toBe('no_answer');
  });
  it('keeps cleanup pending on failed removal; successful hangup has no AI task result', async () => {
    const h = harness();
    h.call.answeredAt = new Date();
    h.call.status = CallStatus.READY;
    h.session.phase = 'connected';
    await h.service.end(actor, 'call');
    h.livekit.deleteHumanRoom.mockRejectedValueOnce(new Error('unavailable'));
    await h.service.tick();
    expect(h.session.finishedAt).toBeNull();
    await h.service.tick();
    expect(h.call).toMatchObject({
      status: 'completed',
      taskStatus: 'not_applicable',
      taskResult: null,
    });
    expect(h.session.finishedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(toCallResponse(h.call))).not.toContain('lease');
  });
  it('only the owned-call lookup can issue join credentials or end calls', async () => {
    const h = harness();
    h.sessions.owned.mockRejectedValue(new NotFoundException());
    await expect(h.service.join(actor, 'foreign')).rejects.toThrow(
      NotFoundException,
    );
    await expect(h.service.end(actor, 'foreign')).rejects.toThrow(
      NotFoundException,
    );
    expect(h.livekit.createHumanParticipantToken).not.toHaveBeenCalled();
  });
  it('cancellation between admission and submission prevents the external dial', async () => {
    const h = harness();
    h.livekit.observeHumanRoom.mockResolvedValue([browser()]);
    h.admission.admitImmediate.mockImplementation(async () => {
      h.session.phase = 'ending';
      h.session.terminalStatus = 'cancelled';
    });
    await h.service.tick();
    expect(h.livekit.createSipParticipant).not.toHaveBeenCalled();
  });
  it('late successful SIP results do not overwrite a concurrent hangup', async () => {
    const h = harness();
    h.livekit.observeHumanRoom.mockResolvedValue([browser()]);
    h.livekit.createSipParticipant.mockImplementation(async () => {
      await h.service.end(actor, 'call');
      return { sipCallId: 'late' };
    });
    await h.service.tick();
    expect(h.session.phase).toBe('ending');
    expect(h.call.livekitSipCallId).toBeNull();
  });
  it('inactive caller triggers cleanup independently of portal polling', async () => {
    const h = harness();
    h.sessions.actorActive.mockResolvedValue(false);
    await h.service.tick();
    expect(h.session.endReason).toBe('caller_inactive');
    expect(h.livekit.createSipParticipant).not.toHaveBeenCalled();
  });
  it('human prices include browser waiting separately and never contain AI session/model charges', () => {
    const result = priceAttempt(
      {
        attempt: 1,
        executionType: 'human',
        medium: 'sip',
        browserJoinedAt: '2026-01-01T00:00:00Z',
        answeredAt: '2026-01-01T00:01:00Z',
        endedAt: '2026-01-01T00:02:00Z',
      },
      { plan: 'ship', agentDeployed: true, sipVendorUsdPerMin: 0.01 },
    );
    expect(result.lines.find((line) => line.key === 'webrtc')?.quantity).toBe(
      2,
    );
    expect(result.lines.find((line) => line.key === 'sip')?.quantity).toBe(1);
    expect(
      result.lines.some((line) =>
        ['agent_session', 'llm', 'tts', 'stt'].includes(line.key),
      ),
    ).toBe(false);
  });
});
