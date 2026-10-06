import type { WhatsAppTaskConfiguration } from '../whatsapp-tasks.js';
export type WhatsAppConversationSummary = {
  id: string;
  sender: string;
  generation: number;
  createdAt: string;
  updatedAt: string;
};
export type WhatsAppConversationDetail = {
  conversation: WhatsAppConversationSummary;
  taskSessions: Array<{
    id: string;
    configuration: WhatsAppTaskConfiguration;
    status: 'active' | 'completed' | 'cancelled';
    outcome: string | null;
    result: Record<string, unknown> | null;
    createdAt: string;
  }>;
  turns: Array<{
    id: string;
    body: string;
    status: string;
    outgoing: { body: string | null; status: string } | null;
  }>;
};
