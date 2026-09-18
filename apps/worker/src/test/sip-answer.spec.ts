import { EventEmitter } from 'node:events';
import { Sipfunctions } from '../sip-answer';

function participant(
  identity: string,
  status?: string,
  tracks = 0,
) {
  const trackPublications = new Map<string, { kind?: number | string }>();
  for (let i = 0; i < tracks; i += 1) {
    trackPublications.set(`tr_${i}`, { kind: 1 });
  }
  return {
    identity,
    attributes: status ? { 'sip.callStatus': status } : {},
    trackPublications,
  };
}

describe('sip-answer', () => {
  const sip = new Sipfunctions();

  it('reads sip.callStatus', () => {
    expect(sip.sipCallStatus(participant('+1', 'ringing'))).toBe('ringing');
    expect(sip.sipCallStatus(participant('+1'))).toBe('');
  });

  it('reads SIP party attributes', () => {
    expect(
      sip.sipParticipantInfo({
        identity: '+1555',
        attributes: {
          'sip.phoneNumber': '+1555',
          'sip.trunkPhoneNumber': '+1800',
          'sip.callID': 'SC_1',
          'sip.trunkID': 'ST_in',
        },
      }),
    ).toEqual({
      identity: '+1555',
      fromNumber: '+1555',
      toNumber: '+1800',
      sipCallId: 'SC_1',
      livekitTrunkId: 'ST_in',
    });
  });

  it('active / automation count as answered', () => {
    expect(sip.isSipAnswered(participant('+1', 'active'))).toBe(true);
    expect(sip.isSipAnswered(participant('+1', 'automation'))).toBe(true);
  });

  it('dialing / ringing / hangup are not answered', () => {
    expect(sip.isSipAnswered(participant('+1', 'dialing'))).toBe(false);
    expect(sip.isSipAnswered(participant('+1', 'ringing'))).toBe(false);
    expect(sip.isSipAnswered(participant('+1', 'hangup'))).toBe(false);
  });

  it('missing status + published audio is answered', () => {
    expect(sip.isSipAnswered(participant('+1', undefined, 1))).toBe(true);
    expect(sip.isSipAnswered(participant('+1', undefined, 0))).toBe(false);
  });

  it('resolves immediately when already active', async () => {
    const room = new EventEmitter();
    await expect(
      sip.waitForSipAnswer({
        room,
        participant: participant('+1', 'active'),
        timeoutMs: 50,
      }),
    ).resolves.toBeUndefined();
  });

  it('resolves when sip.callStatus flips to active', async () => {
    const room = new EventEmitter();
    const p = participant('+1', 'dialing');
    const wait = sip.waitForSipAnswer({ room, participant: p, timeoutMs: 500 });
    queueMicrotask(() => {
      const answered = participant('+1', 'active');
      room.emit('participantAttributesChanged', { 'sip.callStatus': 'active' }, answered);
    });
    await expect(wait).resolves.toBeUndefined();
  });

  it('rejects when callee disconnects before answer', async () => {
    const room = new EventEmitter();
    const p = {
      ...participant('+1', 'ringing'),
      disconnectReason: 15,
    };
    const wait = sip.waitForSipAnswer({ room, participant: p, timeoutMs: 500 });
    queueMicrotask(() => {
      room.emit('participantDisconnected', p);
    });
    await expect(wait).rejects.toThrow(/no answer.*MEDIA_FAILURE/);
  });

  it('resolves when polled attributes flip to active without an event', async () => {
    const room = new EventEmitter();
    const p = participant('+1', 'dialing');
    const wait = sip.waitForSipAnswer({
      room,
      participant: p,
      timeoutMs: 500,
      pollMs: 20,
    });
    setTimeout(() => {
      p.attributes['sip.callStatus'] = 'active';
    }, 40);
    await expect(wait).resolves.toBeUndefined();
  });

  it('names LiveKit media-timeout disconnect reason', () => {
    expect(sip.formatDisconnectReason({ identity: '+1', disconnectReason: 15 })).toBe(
      'MEDIA_FAILURE',
    );
    expect(sip.formatDisconnectReason({ identity: '+1' })).toBe('unknown');
  });

  it('rejects on hangup attribute before answer', async () => {
    const room = new EventEmitter();
    const p = participant('+1', 'ringing');
    const wait = sip.waitForSipAnswer({ room, participant: p, timeoutMs: 500 });
    queueMicrotask(() => {
      room.emit(
        'participantAttributesChanged',
        { 'sip.callStatus': 'hangup' },
        participant('+1', 'hangup'),
      );
    });
    await expect(wait).rejects.toThrow(/hung up before answer/);
  });

  it('rejects on timeout', async () => {
    const room = new EventEmitter();
    await expect(
      sip.waitForSipAnswer({
        room,
        participant: participant('+1', 'ringing'),
        timeoutMs: 20,
      }),
    ).rejects.toThrow(/timeout/);
  });
});
