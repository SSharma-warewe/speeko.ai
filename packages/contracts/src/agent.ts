export const AgentDirection = {
  INBOUND: 'inbound',
  OUTBOUND: 'outbound',
} as const;
export type AgentDirection =
  (typeof AgentDirection)[keyof typeof AgentDirection];
