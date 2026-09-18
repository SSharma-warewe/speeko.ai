/**
 * LiveKit adds the SIP participant to the room while the far end is still
 * ringing (`sip.callStatus` = dialing | ringing). waitForParticipant therefore
 * resolves before the human answers. Opening speech must wait for `active`.
 */

export const SIP_ANSWER_TIMEOUT_MS = 60_000;
export const SIP_ANSWER_POLL_MS = 250;

const ANSWERED_STATUSES = new Set(['active', 'automation']);
const PRE_ANSWER_STATUSES = new Set(['dialing', 'ringing']);

/** LiveKit DisconnectReason names we care about for unanswered outbound. */
const DISCONNECT_REASON_NAMES: Record<number, string> = {
  1: 'CLIENT_INITIATED',
  4: 'PARTICIPANT_REMOVED',
  5: 'ROOM_DELETED',
  11: 'USER_UNAVAILABLE',
  12: 'USER_REJECTED',
  13: 'SIP_TRUNK_FAILURE',
  14: 'CONNECTION_TIMEOUT',
  15: 'MEDIA_FAILURE',
};

export type SipAnswerParticipant = {
  identity: string;
  attributes?: Record<string, string>;
  trackPublications?: Map<string, { kind?: number | string }>;
  disconnectReason?: number | string;
};

export type SipAnswerRoom = {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
};
export type SipParticipantInfo = {
  identity: string;
  fromNumber: string | null;
  toNumber: string | null;
  sipCallId: string | null;
  livekitTrunkId: string | null;
};

export class Sipfunctions {
   sipCallStatus(
    participant: SipAnswerParticipant,
  ): string {
    return (participant.attributes?.['sip.callStatus'] ?? '').trim().toLowerCase();
  }
  attr(
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
  sipParticipantInfo(
    participant: SipAnswerParticipant,
  ): SipParticipantInfo {
    return {
      identity: participant.identity,
      fromNumber: this.attr(participant, 'sip.phoneNumber'),
      toNumber: this.attr(participant, 'sip.trunkPhoneNumber'),
      sipCallId: this.attr(participant, 'sip.callID', 'sip.callId'),
      livekitTrunkId: this.attr(participant, 'sip.trunkID', 'sip.trunkId'),
    };
  }
  isSipAnswered(participant: SipAnswerParticipant): boolean {
    const status = this.sipCallStatus(participant);
    if (ANSWERED_STATUSES.has(status)) {
      return true;
    }
    if (PRE_ANSWER_STATUSES.has(status) || status === 'hangup') {
      return false;
    }
    // Providers that omit sip.callStatus: treat published audio as answered.
    return this.hasPublishedAudio(participant);
  }
  formatDisconnectReason(
    participant: SipAnswerParticipant,
  ): string {
    const raw = participant.disconnectReason;
    if (raw === undefined || raw === null || raw === '') {
      return 'unknown';
    }
    if (typeof raw === 'number') {
      return DISCONNECT_REASON_NAMES[raw] ?? `code_${raw}`;
    }
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && DISCONNECT_REASON_NAMES[asNum]) {
      return DISCONNECT_REASON_NAMES[asNum];
    }
    return String(raw);
  }
  hasPublishedAudio(participant: SipAnswerParticipant): boolean {
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
  sameIdentity(
    left: { identity?: string },
    right: SipAnswerParticipant,
  ): boolean {
    return (left.identity ?? '') === right.identity;
  }
  async waitForSipAnswer(input: {
    room: SipAnswerRoom;
    participant: SipAnswerParticipant;
    timeoutMs?: number;
    pollMs?: number;
  }): Promise<void> {
    const { room, participant } = input;
    const timeoutMs = input.timeoutMs ?? SIP_ANSWER_TIMEOUT_MS;
    const pollMs = input.pollMs ?? SIP_ANSWER_POLL_MS;

    if (this.isSipAnswered(participant)) {
      return;
    }
    if (this.sipCallStatus(participant) === 'hangup') {
      throw new Error('SIP callee hung up before answer (no answer)');
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let lastStatus = this.sipCallStatus(participant);

      const finish = (err?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        clearInterval(poll);
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

      const consider = (p: SipAnswerParticipant) => {
        const status = this.sipCallStatus(p);
        if (status && status !== lastStatus) {
          lastStatus = status;
          console.log(
            `[sip-answer] identity=${p.identity} sipStatus=${status}`,
          );
        }
        if (this.isSipAnswered(p)) {
          finish();
          return true;
        }
        if (status === 'hangup') {
          finish(new Error('SIP callee hung up before answer (no answer)'));
          return true;
        }
        return false;
      };

      const timer = setTimeout(() => {
        finish(
          new Error(
            `SIP callee did not answer (timeout after ${timeoutMs}ms)`,
          ),
        );
      }, timeoutMs);

      const poll = setInterval(() => {
        consider(participant);
      }, pollMs);

      const onAttrs = (...args: unknown[]) => {
        const p = (args[1] ?? args[0]) as SipAnswerParticipant | undefined;
        if (!p || !this.sameIdentity(p, participant)) {
          return;
        }
        consider(p);
      };

      const onTrackPublished = (...args: unknown[]) => {
        const p = (args[1] ?? args[0]) as SipAnswerParticipant | undefined;
        if (!p || !this.sameIdentity(p, participant)) {
          return;
        }
        consider(p);
      };

      const onParticipantDisconnected = (...args: unknown[]) => {
        const p = args[0] as SipAnswerParticipant | undefined;
        if (!p || !this.sameIdentity(p, participant)) {
          return;
        }
        const reason = this.formatDisconnectReason(p);
        const status = this.sipCallStatus(p) || lastStatus || 'n/a';
        const attrs = p.attributes
          ? Object.entries(p.attributes)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ')
          : '';
        console.log(
          `[sip-answer] disconnect identity=${p.identity} reason=${reason} status=${status}` +
          (attrs ? ` ${attrs}` : ''),
        );
        finish(
          new Error(
            `SIP callee disconnected before answer (no answer) reason=${reason} status=${status}`,
          ),
        );
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

}


/** Caller / dialed numbers and SIP ids from LiveKit participant attributes. */







/**
 * Resolves when the SIP callee answers. Rejects on hangup, disconnect, or timeout.
 * Error messages include "no answer" so API retry classification maps to no_answer.
 */