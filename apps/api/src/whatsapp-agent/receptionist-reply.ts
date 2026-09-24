/** One turn of the Warewe receptionist. `from` is the WhatsApp sender digits. */
export interface ReceptionistReply {
  reply(from: string, text: string): Promise<string>;
}

export const RECEPTIONIST_REPLY = Symbol('RECEPTIONIST_REPLY');
