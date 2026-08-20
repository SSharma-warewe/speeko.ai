import type { ToolContextEntry } from '@livekit/agents';
import { createBookingTool } from './booking.tool.js';
import { createCancelBookingTool } from './cancel-booking.tool.js';
import { createCancelCalendarEventTool } from './cancel-calendar-event.tool.js';
import { createCheckCalendarAvailabilityTool } from './check-calendar-availability.tool.js';
import { createCheckGhlFreeSlotsTool } from './check-ghl-free-slots.tool.js';
import { createConfirmAppointmentTool } from './confirm-appointment.tool.js';
import { createCreateCalendarEventTool } from './create-calendar-event.tool.js';
import { createEndCallTool } from './end-call.tool.js';
import { createListCalendarEventsTool } from './list-calendar-events.tool.js';
import { createLookupCustomerTool } from './lookup-customer.tool.js';
import { createLookupGhlContactTool } from './lookup-ghl-contact.tool.js';
import { createScheduleGhlMeetingTool } from './schedule-ghl-meeting.tool.js';
import { TOOL_IDS } from './tool-ids.js';
import { createTransferCallTool } from './transfer-call.tool.js';
import { createUpsertGhlContactTool } from './upsert-ghl-contact.tool.js';
import type { ToolFactory, ToolFactoryContext } from './types.js';

const factories = new Map<string, ToolFactory>([
  [TOOL_IDS.endCall, createEndCallTool],
  [TOOL_IDS.booking, createBookingTool],
  [TOOL_IDS.cancelBooking, createCancelBookingTool],
  [TOOL_IDS.transferCall, createTransferCallTool],
  [TOOL_IDS.lookupCustomer, createLookupCustomerTool],
  [TOOL_IDS.confirmAppointment, createConfirmAppointmentTool],
  [TOOL_IDS.checkCalendarAvailability, createCheckCalendarAvailabilityTool],
  [TOOL_IDS.listCalendarEvents, createListCalendarEventsTool],
  [TOOL_IDS.createCalendarEvent, createCreateCalendarEventTool],
  [TOOL_IDS.cancelCalendarEvent, createCancelCalendarEventTool],
  [TOOL_IDS.checkGhlFreeSlots, createCheckGhlFreeSlotsTool],
  [TOOL_IDS.lookupGhlContact, createLookupGhlContactTool],
  [TOOL_IDS.upsertGhlContact, createUpsertGhlContactTool],
  [TOOL_IDS.scheduleGhlMeeting, createScheduleGhlMeetingTool],
]);

function toolEntryKey(entry: ToolContextEntry, fallback: string): string {
  if ('name' in entry && typeof (entry as { name?: string }).name === 'string') {
    return (entry as { name: string }).name;
  }
  if ('id' in entry && typeof (entry as { id?: string }).id === 'string') {
    return (entry as { id: string }).id;
  }
  return fallback;
}

export class ToolRegistry {
  static has(id: string): boolean {
    return factories.has(id);
  }

  static listIds(): string[] {
    return [...factories.keys()].sort();
  }

  static get(id: string): ToolFactory | undefined {
    return factories.get(id);
  }

  /**
   * Resolve metadata `enabledTools` IDs to concrete LiveKit tools (array form).
   * Unknown IDs are skipped with a warning. Always includes endCall if missing.
   */
  static async resolve(
    enabledToolIds: string[] | undefined,
    ctx: ToolFactoryContext,
  ): Promise<ToolContextEntry[]> {
    const ids =
      Array.isArray(enabledToolIds) && enabledToolIds.length > 0
        ? enabledToolIds
        : [TOOL_IDS.endCall];

    const tools: ToolContextEntry[] = [];
    const seen = new Set<string>();
    let hasEndCall = false;

    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const factory = factories.get(id);
      if (!factory) {
        console.warn(`[ToolRegistry] unknown tool id skipped: ${id}`);
        continue;
      }
      const built = await factory(ctx);
      const list = Array.isArray(built) ? built : [built];
      for (const entry of list) {
        const key = toolEntryKey(entry, id);
        if (key === 'end_call' || key === 'endCall' || id === TOOL_IDS.endCall) {
          hasEndCall = true;
        }
        tools.push(entry);
      }
    }

    if (!hasEndCall && factories.has(TOOL_IDS.endCall)) {
      const end = await factories.get(TOOL_IDS.endCall)!(ctx);
      const list = Array.isArray(end) ? end : [end];
      tools.push(...list);
    }

    return tools;
  }
}
