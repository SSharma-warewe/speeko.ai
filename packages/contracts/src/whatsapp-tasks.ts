/** Versioned WhatsApp workflows; independent of the LiveKit voice task registry. */
export const WHATSAPP_TASK_KEYS = [
  'receptionist',
  'appointment_booking',
] as const;
export type WhatsAppTaskKey = (typeof WHATSAPP_TASK_KEYS)[number];
export const WHATSAPP_TASKS = {
  receptionist: {
    name: 'Receptionist',
    version: 1,
    objective:
      'Understand the customer requirement and arrange a suitable team appointment. Ask short relevant questions, one at a time. Your main objective is to create the agreed GHL booking.',
  },
  appointment_booking: {
    name: 'Appointment booking',
    version: 1,
    objective:
      'Arrange one appointment for this customer. Find or create their contact, check open slots, ask which slot they want, and create the agreed GHL booking.',
  },
} as const;
export const WHATSAPP_TASK_COMPLETION =
  'Ends when a GHL appointment is created.';
export function isWhatsAppTaskKey(value: unknown): value is WhatsAppTaskKey {
  return WHATSAPP_TASK_KEYS.some((key) => key === value);
}
export type WhatsAppTaskConfiguration = {
  key: WhatsAppTaskKey;
  version: number;
  objective: string;
  completionRule: 'ghl_appointment_created';
  persona: string;
  toolProfileId: string;
  voiceAgentId: string;
  calendarIntegrationId: string;
  locationId: string;
  calendarId: string;
  enabledTools: import('./whatsapp-harness.js').WhatsAppAgentToolId[];
};
export type WhatsAppTaskRuntime = {
  sessionId: string;
  key: WhatsAppTaskKey;
  version: number;
  objective: string;
  completionRule: 'ghl_appointment_created';
  status: 'active' | 'completed' | 'cancelled';
  result: Record<string, unknown> | null;
};
