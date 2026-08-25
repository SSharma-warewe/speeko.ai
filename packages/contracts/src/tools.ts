/**
 * Worker ToolRegistry ids. API stores these on tool_profile_tools.tool_id.
 * Never put executable code or JSON tool schemas in the database.
 */
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
  checkGhlFreeSlots: 'checkGhlFreeSlots',
  lookupGhlContact: 'lookupGhlContact',
  upsertGhlContact: 'upsertGhlContact',
  scheduleGhlMeeting: 'scheduleGhlMeeting',
} as const;

export type KnownToolId = (typeof TOOL_IDS)[keyof typeof TOOL_IDS];

export const KNOWN_TOOL_IDS = [
  TOOL_IDS.endCall,
  TOOL_IDS.booking,
  TOOL_IDS.cancelBooking,
  TOOL_IDS.transferCall,
  TOOL_IDS.lookupCustomer,
  TOOL_IDS.confirmAppointment,
  TOOL_IDS.checkCalendarAvailability,
  TOOL_IDS.listCalendarEvents,
  TOOL_IDS.createCalendarEvent,
  TOOL_IDS.cancelCalendarEvent,
  TOOL_IDS.checkGhlFreeSlots,
  TOOL_IDS.lookupGhlContact,
  TOOL_IDS.upsertGhlContact,
  TOOL_IDS.scheduleGhlMeeting,
] as const satisfies readonly KnownToolId[];

export function isKnownToolId(id: string): id is KnownToolId {
  return (KNOWN_TOOL_IDS as readonly string[]).includes(id);
}
