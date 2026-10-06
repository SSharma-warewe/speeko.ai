/** Org WhatsApp inbound agent persona (Agent tab). */
export type WhatsAppAgentConfig = {
  whatsappTaskId: string | null;
  taskContext: Record<string, unknown>;
  taskKey: import('../whatsapp-tasks.js').WhatsAppTaskKey | null;
  /** Null when unset; empty string clears/disables auto-reply. */
  systemPrompt: string | null;
  bookingVoiceAgentId: string | null;
  whatsappToolProfileId: string | null;
  /** Read-only example used by the separate platform receptionist. */
  platformPrompt: string;
};

export type UpdateWhatsAppAgentRequest = {
  whatsappTaskId?: string | null;
  taskContext?: Record<string, unknown>;
  taskKey?: import('../whatsapp-tasks.js').WhatsAppTaskKey | null;
  systemPrompt: string;
  bookingVoiceAgentId?: string | null;
  whatsappToolProfileId?: string | null;
};
