import { EventEmitter } from 'node:events';
import {
  isSipAnswered,
  sipCallStatus,
  waitForSipAnswer,
} from '../sip-answer';

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
  it('reads sip.callStatus', () => {
    expect(sipCallStatus(participant('+1', 'ringing'))).toBe('ringing');
    expect(sipCallStatus(participant('+1'))).toBe('');
  });

  it('active / automation count as answered', () => {
    expect(isSipAnswered(participant('+1', 'active'))).toBe(true);
    expect(isSipAnswered(participant('+1', 'automation'))).toBe(true);
  });

  it('dialing / ringing / hangup are not answered', () => {
    expect(isSipAnswered(participant('+1', 'dialing'))).toBe(false);
    expect(isSipAnswered(participant('+1', 'ringing'))).toBe(false);
    expect(isSipAnswered(participant('+1', 'hangup'))).toBe(false);
  });

  it('missing status + published audio is answered', () => {
    expect(isSipAnswered(participant('+1', undefined, 1))).toBe(true);
    expect(isSipAnswered(participant('+1', undefined, 0))).toBe(false);
  });

  it('resolves immediately when already active', async () => {
    const room = new EventEmitter();
    await expect(
      waitForSipAnswer({
        room,
        participant: participant('+1', 'active'),
        timeoutMs: 50,
      }),
    ).resolves.toBeUndefined();
  });

  it('resolves when sip.callStatus flips to active', async () => {
    const room = new EventEmitter();
    const p = participant('+1', 'dialing');
    const wait = waitForSipAnswer({ room, participant: p, timeoutMs: 500 });
    queueMicrotask(() => {
      const answered = participant('+1', 'active');
      room.emit('participantAttributesChanged', { 'sip.callStatus': 'active' }, answered);
    });
    await expect(wait).resolves.toBeUndefined();
  });

  it('rejects when callee disconnects before answer', async () => {
    const room = new EventEmitter();
    const p = participant('+1', 'ringing');
    const wait = waitForSipAnswer({ room, participant: p, timeoutMs: 500 });
    queueMicrotask(() => {
      room.emit('participantDisconnected', p);
    });
    await expect(wait).rejects.toThrow(/no answer/);
  });

  it('rejects on hangup attribute before answer', async () => {
    const room = new EventEmitter();
    const p = participant('+1', 'ringing');
    const wait = waitForSipAnswer({ room, participant: p, timeoutMs: 500 });
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
      waitForSipAnswer({
        room,
        participant: participant('+1', 'ringing'),
        timeoutMs: 20,
      }),
    ).rejects.toThrow(/timeout/);
  });
});
