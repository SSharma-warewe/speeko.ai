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
} as const;

export type ToolId = (typeof TOOL_IDS)[keyof typeof TOOL_IDS];
