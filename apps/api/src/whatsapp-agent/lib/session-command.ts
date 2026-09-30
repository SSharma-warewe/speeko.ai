/** Exact inbound text that resets the sender's durable conversation generation. */
export const NEW_SESSION_COMMAND = '/new';

export const NEW_SESSION_REPLY = 'Starting a new conversation. How can I help?';

/** True for `/new` after trim, any letter case. Extra words stay a normal turn. */
export function isNewSessionCommand(body: string): boolean {
  return body.trim().toLowerCase() === NEW_SESSION_COMMAND;
}
