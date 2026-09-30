/** API dispatches turns on its ticker; workers never read the database. */
export const WHATSAPP_AGENT_TOOL_IDS = [
  'lookupGhlContact',
  'upsertGhlContact',
  'checkGhlFreeSlots',
  'scheduleGhlMeeting',
] as const;
export type WhatsAppAgentToolId = (typeof WHATSAPP_AGENT_TOOL_IDS)[number];
export type WhatsAppConversationScope = 'org' | 'platform';
export type WhatsAppDeliveryKind = 'text' | 'otp_template';
export type WhatsAppTurnStatus =
  'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type WhatsAppSendStatus =
  'pending' | 'sending' | 'accepted' | 'uncertain' | 'failed' | 'cancelled';
export type WhatsAppSessionSnapshot = {
  state: Record<string, unknown>;
  events: Record<string, unknown>[];
};
export type WhatsAppTurnCheckpoint = {
  session: WhatsAppSessionSnapshot;
  reply?: string;
  /** A model request only; the API checks quoted evidence and unresolved writes. */
  decline?: { evidence: string };
};
export type WhatsAppWorkerTurn = {
  id: string;
  conversationId: string;
  generation: number;
  leaseToken: string;
  sender: string;
  body: string;
  prompt: string;
  enabledTools: WhatsAppAgentToolId[];
  session: WhatsAppSessionSnapshot;
  checkpoint: WhatsAppTurnCheckpoint | null;
  /** Null for the environment-configured platform receptionist. */
  task: import('./whatsapp-tasks.js').WhatsAppTaskRuntime | null;
};
export type WhatsAppTurnLease = { leaseToken: string };
export type WhatsAppTurnComplete = WhatsAppTurnLease & WhatsAppTurnCheckpoint;
export type WhatsAppToolRequest = WhatsAppTurnLease & {
  toolId: WhatsAppAgentToolId;
  args: Record<string, string>;
};
export const WHATSAPP_AGENT_MODEL = 'openai/gpt-5.6-luna';
