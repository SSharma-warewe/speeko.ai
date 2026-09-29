/** One turn of the WhatsApp receptionist. `from` is the WhatsApp sender digits. */

export type ReceptionistReplyOpts = {
  /** ADK agent instruction. Defaults to the platform Warewe receptionist prompt. */
  instruction?: string;
  /** In-memory session id. Defaults to `from`. Use `{orgId}:{from}` for org path. */
  sessionKey?: string;
  bookingSource?: {
    organizationId: string;
    voiceAgentId: string;
    toolIds: string[];
  };
};

export type ReceptionistResetOpts = {
  sessionKey?: string;
};

export interface ReceptionistReply {
  reply(
    from: string,
    text: string,
    opts?: ReceptionistReplyOpts,
  ): Promise<string>;
  reset(from: string, opts?: ReceptionistResetOpts): Promise<void>;
}

export const RECEPTIONIST_REPLY = Symbol('RECEPTIONIST_REPLY');
