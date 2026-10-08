/** Human-operated call capabilities; distinct from AI worker tools. */
export const HUMAN_CALL_TOOL_IDS = ['interest', 'bookMeeting', 'notes'] as const;
export type HumanCallToolId = (typeof HUMAN_CALL_TOOL_IDS)[number];
export type HumanCallInterest = 'interested' | 'not_interested';
export type HumanCallAction = {
  requestId: string;
  kind: 'bookMeeting' | 'publishSummary';
  status: 'pending' | 'succeeded' | 'failed' | 'uncertain';
  createdAt: string;
  completedAt: string | null;
  providerId: string | null;
  message: string | null;
  meeting?: HumanCallMeeting;
};
export type HumanCallMeeting = {
  calendarId: string;
  title: string;
  startTime: string;
  endTime: string;
  timezone: string;
};
export type HumanCallWorkspace = {
  selectedTools: HumanCallToolId[];
  interest: HumanCallInterest | null;
  notes: string;
  revision: number;
  updatedAt: string | null;
  updatedBy: string | null;
  actions: HumanCallAction[];
};
export type UpdateHumanCallWorkspace = {
  revision: number;
  interest?: HumanCallInterest | null;
  notes?: string;
};
export type HumanCallWorkspaceActionRequest = {
  requestId: string;
  revision: number;
  kind: 'bookMeeting' | 'publishSummary';
  meeting?: HumanCallMeeting;
};
export type ResolveHumanCallActionRequest = {
  resolution: 'found' | 'not_found';
  providerId?: string;
};
