/**
 * LiveKit adds the SIP participant to the room while the far end is still
 * ringing (`sip.callStatus` = dialing | ringing). waitForParticipant therefore
 * resolves before the human answers. Opening speech must wait for `active`.
 */

export const SIP_ANSWER_TIMEOUT_MS = 60_000;

const ANSWERED_STATUSES = new Set(['active', 'automation']);
const PRE_ANSWER_STATUSES = new Set(['dialing', 'ringing']);

export type SipAnswerParticipant = {
  identity: string;
  attributes?: Record<string, string>;
  trackPublications?: Map<string, { kind?: number | string }>;
};

export type SipAnswerRoom = {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
};

export function sipCallStatus(
  participant: SipAnswerParticipant,
): string {
  return (participant.attributes?.['sip.callStatus'] ?? '').trim().toLowerCase();
}

export type SipParticipantInfo = {
  identity: string;
  fromNumber: string | null;
  toNumber: string | null;
  sipCallId: string | null;
  livekitTrunkId: string | null;
};

function attr(
  participant: SipAnswerParticipant,
  ...keys: string[]
): string | null {
  const attrs = participant.attributes ?? {};
  for (const key of keys) {
    const value = attrs[key]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

/** Caller / dialed numbers and SIP ids from LiveKit participant attributes. */
export function sipParticipantInfo(
  participant: SipAnswerParticipant,
): SipParticipantInfo {
  return {
    identity: participant.identity,
    fromNumber: attr(participant, 'sip.phoneNumber'),
    toNumber: attr(participant, 'sip.trunkPhoneNumber'),
    sipCallId: attr(participant, 'sip.callID', 'sip.callId'),
    livekitTrunkId: attr(participant, 'sip.trunkID', 'sip.trunkId'),
  };
}

export function isSipAnswered(participant: SipAnswerParticipant): boolean {
  const status = sipCallStatus(participant);
  if (ANSWERED_STATUSES.has(status)) {
    return true;
  }
  if (PRE_ANSWER_STATUSES.has(status) || status === 'hangup') {
    return false;
  }
  // Providers that omit sip.callStatus: treat published audio as answered.
  return hasPublishedAudio(participant);
}

function hasPublishedAudio(participant: SipAnswerParticipant): boolean {
  const pubs = participant.trackPublications;
  if (!pubs || pubs.size === 0) {
    return false;
  }
  for (const pub of pubs.values()) {
    const kind = pub.kind;
    if (kind === undefined || kind === null) {
      return true;
    }
    if (kind === 1 || kind === 'audio' || kind === 'KIND_AUDIO') {
      return true;
    }
  }
  return false;
}

function sameIdentity(
  left: { identity?: string },
  right: SipAnswerParticipant,
): boolean {
  return (left.identity ?? '') === right.identity;
}

/**
 * Resolves when the SIP callee answers. Rejects on hangup, disconnect, or timeout.
 * Error messages include "no answer" so API retry classification maps to no_answer.
 */
export async function waitForSipAnswer(input: {
  room: SipAnswerRoom;
  participant: SipAnswerParticipant;
  timeoutMs?: number;
}): Promise<void> {
  const { room, participant } = input;
  const timeoutMs = input.timeoutMs ?? SIP_ANSWER_TIMEOUT_MS;

  if (isSipAnswered(participant)) {
    return;
  }
  if (sipCallStatus(participant) === 'hangup') {
    throw new Error('SIP callee hung up before answer (no answer)');
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      room.off('participantAttributesChanged', onAttrs);
      room.off('trackPublished', onTrackPublished);
      room.off('participantDisconnected', onParticipantDisconnected);
      room.off('disconnected', onRoomDisconnected);
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    const timer = setTimeout(() => {
      finish(
        new Error(
          `SIP callee did not answer (timeout after ${timeoutMs}ms)`,
        ),
      );
    }, timeoutMs);

    const onAttrs = (...args: unknown[]) => {
      const p = (args[1] ?? args[0]) as SipAnswerParticipant | undefined;
      if (!p || !sameIdentity(p, participant)) {
        return;
      }
      if (isSipAnswered(p)) {
        finish();
        return;
      }
      if (sipCallStatus(p) === 'hangup') {
        finish(new Error('SIP callee hung up before answer (no answer)'));
      }
    };

    const onTrackPublished = (...args: unknown[]) => {
      const p = (args[1] ?? args[0]) as SipAnswerParticipant | undefined;
      if (!p || !sameIdentity(p, participant)) {
        return;
      }
      if (isSipAnswered(p)) {
        finish();
      }
    };

    const onParticipantDisconnected = (...args: unknown[]) => {
      const p = args[0] as SipAnswerParticipant | undefined;
      if (!p || !sameIdentity(p, participant)) {
        return;
      }
      finish(new Error('SIP callee disconnected before answer (no answer)'));
    };

    const onRoomDisconnected = () => {
      finish(new Error('Room disconnected before SIP callee answered (no answer)'));
    };

    room.on('participantAttributesChanged', onAttrs);
    room.on('trackPublished', onTrackPublished);
    room.on('participantDisconnected', onParticipantDisconnected);
    room.on('disconnected', onRoomDisconnected);
  });
}
