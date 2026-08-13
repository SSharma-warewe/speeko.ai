/** Stable tool IDs shared with API tool_profile_tools.tool_id. */
export const TOOL_IDS = {
  endCall: 'endCall',
  booking: 'booking',
  cancelBooking: 'cancelBooking',
  transferCall: 'transferCall',
  lookupCustomer: 'lookupCustomer',
  confirmAppointment: 'confirmAppointment',
  checkCalendarAvailability: 'checkCalendarAvailability',
  listCalendarEvents: 'listCalendarEvents',
  createCalendarEvent: 'createCalendarEvent',
  cancelCalendarEvent: 'cancelCalendarEvent',
  /** Platform GHL calendar (env GHL_CALENDAR + GHL_CALENDAR_ID) */
  checkGhlFreeSlots: 'checkGhlFreeSlots',
  scheduleGhlMeeting: 'scheduleGhlMeeting',
} as const;

export type ToolId = (typeof TOOL_IDS)[keyof typeof TOOL_IDS];
