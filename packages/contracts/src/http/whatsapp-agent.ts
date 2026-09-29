/** Org WhatsApp inbound agent persona (Agent tab). */
export type WhatsAppAgentConfig = {
  /** Null when unset; empty string clears/disables auto-reply. */
  systemPrompt: string | null;
};

export type UpdateWhatsAppAgentRequest = {
  systemPrompt: string;
};
