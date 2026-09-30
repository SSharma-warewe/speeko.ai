import { WHATSAPP_AGENT_TOOL_IDS } from '@call-agent/contracts';

/** Existing worker tool ids that the WhatsApp ADK runner can execute. */
export const WHATSAPP_GHL_TOOL_IDS = WHATSAPP_AGENT_TOOL_IDS;

export function whatsappGhlToolIds(ids: readonly string[]): string[] {
  const enabled = new Set(ids);
  return WHATSAPP_GHL_TOOL_IDS.filter((id) => enabled.has(id));
}
