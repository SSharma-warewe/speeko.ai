import type { CallRecord } from './calls.js';

export type HumanCallPhase =
  | 'preparing'
  | 'waiting_for_user'
  | 'dialing'
  | 'connected'
  | 'reconnecting'
  | 'ending'
  | 'ended';
export type CreateHumanCallRequest = {
  crmIntegrationId: string;
  crmContactId: string;
  sipTrunkId: string;
  requestId: string;
};
export type HumanCallSummary = {
  callerName: string;
  contactName: string;
  crmIntegrationId: string | null;
  crmContactId: string;
  phase: HumanCallPhase;
  joinDeadline: string;
  endReason: string | null;
};
export type HumanCallResponse = {
  call: CallRecord;
  session: HumanCallSummary;
  meetUrl?: string;
};
export type ActiveHumanCallResponse = {
  enabled: boolean;
  active: HumanCallResponse | null;
};
