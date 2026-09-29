import { TOOL_IDS } from '@call-agent/contracts';

/** Existing worker tool ids that the WhatsApp ADK runner can execute. */
export const WHATSAPP_GHL_TOOL_IDS = [
  TOOL_IDS.lookupGhlContact,
  TOOL_IDS.upsertGhlContact,
  TOOL_IDS.checkGhlFreeSlots,
  TOOL_IDS.scheduleGhlMeeting,
] as const;

export function whatsappGhlToolIds(ids: readonly string[]): string[] {
  const enabled = new Set(ids);
  return WHATSAPP_GHL_TOOL_IDS.filter((id) => enabled.has(id));
}
