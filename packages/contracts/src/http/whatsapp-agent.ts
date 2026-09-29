/** Org WhatsApp inbound agent persona (Agent tab). */
export type WhatsAppAgentConfig = {
  /** Null when unset; empty string clears/disables auto-reply. */
  systemPrompt: string | null;
  /** Read-only example used by the separate platform receptionist. */
  platformPrompt: string;
};

export type UpdateWhatsAppAgentRequest = {
  systemPrompt: string;
};
