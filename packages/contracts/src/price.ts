/** LiveKit Cloud plan used to pick list (overage) rates. */
export type PricingPlan = 'build' | 'ship' | 'scale';

export const PRICING_PLANS = ['build', 'ship', 'scale'] as const;

export type CostLineKey =
  | 'llm'
  | 'stt'
  | 'tts'
  | 'webrtc'
  | 'sip'
  | 'agent_session'
  | 'krisp'
  | 'sip_vendor'
  | 'eot';

export const COST_LINE_KEYS = [
  'llm',
  'stt',
  'tts',
  'webrtc',
  'sip',
  'agent_session',
  'krisp',
  'sip_vendor',
  'eot',
] as const satisfies readonly CostLineKey[];

export type CostUnit =
  | 'tokens_in'
  | 'tokens_cached'
  | 'tokens_out'
  | 'minutes'
  | 'characters'
  | 'requests';

export const COST_UNITS = [
  'tokens_in',
  'tokens_cached',
  'tokens_out',
  'minutes',
  'characters',
  'requests',
] as const satisfies readonly CostUnit[];

export type CallCostLine = {
  key: CostLineKey;
  label: string;
  model?: string | null;
  quantity: number;
  unit: CostUnit;
  unitPriceUsd: number;
  amountUsd: number;
  notes?: string;
};

export type CallCostAttempt = {
  attempt: number;
  billedMinutes: number;
  totalUsd: number;
  lines: CallCostLine[];
  unknownModels: string[];
};

export type CallCostSnapshot = {
  currency: 'USD';
  markup: 0;
  plan: PricingPlan;
  catalogAsOf: string;
  totalUsd: number;
  billedMinutes: number;
  unknownModels: string[];
  lines: CallCostLine[];
  attempts: CallCostAttempt[];
};

export type CostSummaryByKey = {
  key: string;
  amountUsd: number;
};

export type CostSummaryDaily = {
  date: string;
  callCount: number;
  totalUsd: number;
};

export type CostSummary = {
  currency: 'USD';
  markup: 0;
  plan: PricingPlan;
  catalogAsOf: string;
  from: string;
  to: string;
  organizationId: string | null;
  callCount: number;
  unpricedCount: number;
  totalUsd: number;
  avgUsd: number;
  billedMinutes: number;
  byKey: CostSummaryByKey[];
  daily: CostSummaryDaily[];
};
