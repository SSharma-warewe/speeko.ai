/**
 * Tool IDs known to the LiveKit worker ToolRegistry.
 * API stores these strings on tool_profile_tools; worker resolves implementations.
 * Never put executable code or JSON tool schemas in the database.
 */
export const KNOWN_TOOL_IDS = [
  'endCall',
  'booking',
  'cancelBooking',
  'transferCall',
  'lookupCustomer',
  'confirmAppointment',
  /** Nylas calendar — requires agent calendarIntegrationId */
  'checkCalendarAvailability',
  'listCalendarEvents',
  'createCalendarEvent',
  'cancelCalendarEvent',
  /** Platform GHL calendar — env GHL_CALENDAR + GHL_CALENDAR_ID (not Nylas) */
  'checkGhlFreeSlots',
  'scheduleGhlMeeting',
] as const;

export type KnownToolId = (typeof KNOWN_TOOL_IDS)[number];

export function isKnownToolId(id: string): id is KnownToolId {
  return (KNOWN_TOOL_IDS as readonly string[]).includes(id);
}

/**
 * LiveKit Task keys registered in the worker TaskRegistry.
 * Metadata carries only the key; worker instantiates the task class.
 */
export const KNOWN_TASK_KEYS = [
  'general',
  'confirm_appointment',
  'lead_qualification',
  'customer_support',
  'survey',
  'debt_collection',
  'demo_booking',
] as const;

export type KnownTaskKey = (typeof KNOWN_TASK_KEYS)[number];

export function isKnownTaskKey(key: string): key is KnownTaskKey {
  return (KNOWN_TASK_KEYS as readonly string[]).includes(key);
}

export const DEFAULT_TASK_KEY: KnownTaskKey = 'general';
