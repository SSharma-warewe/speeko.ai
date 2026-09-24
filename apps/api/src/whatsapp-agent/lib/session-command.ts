/** Exact inbound text that drops the sender's in-memory receptionist session. */
export const NEW_SESSION_COMMAND = '/new';

export const NEW_SESSION_REPLY =
  'Starting a new conversation. How can I help?';

/** True for `/new` after trim, any letter case. Extra words stay a normal turn. */
export function isNewSessionCommand(body: string): boolean {
  return body.trim().toLowerCase() === NEW_SESSION_COMMAND;
}
