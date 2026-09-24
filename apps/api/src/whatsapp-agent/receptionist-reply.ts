/** One turn of the Warewe receptionist. `from` is the WhatsApp sender digits. */
export interface ReceptionistReply {
  reply(from: string, text: string): Promise<string>;
  /** Drop the in-memory ADK session for this sender so the next turn starts clean. */
  reset(from: string): Promise<void>;
}

export const RECEPTIONIST_REPLY = Symbol('RECEPTIONIST_REPLY');
