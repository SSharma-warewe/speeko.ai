/** LiveKit Cloud plan used to pick list (overage) rates. */
export type PricingPlan = 'build' | 'ship' | 'scale';

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

export type CostUnit =
  | 'tokens_in'
  | 'tokens_cached'
  | 'tokens_out'
  | 'minutes'
  | 'characters'
  | 'requests';

export type CallCostLine = {
  key: CostLineKey;
  label: string;
  model?: string | null;
  quantity: number;
  unit: CostUnit;
  /**
   * Catalog rate for one "price unit":
   * - minutes → USD per minute
   * - tokens_* → USD per 1M tokens
   * - characters → USD per 1M characters
   * - requests → USD per request (usually 0)
   */
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

export type PriceAttemptInput = {
  attempt: number;
  medium: string;
  usage?: { models?: unknown[]; modelUsage?: unknown[]; [key: string]: unknown } | null;
  answeredAt?: Date | string | null;
  startedAt?: Date | string | null;
  endedAt?: Date | string | null;
  dialStartedAt?: Date | string | null;
  krispEnabled?: boolean;
};

export type PriceRuntimeConfig = {
  plan: PricingPlan;
  agentDeployed: boolean;
  sipVendorUsdPerMin: number;
};

export type UsageModelRow = {
  type?: string;
  provider?: string;
  model?: string;
  inputTokens?: number;
  inputCachedTokens?: number;
  outputTokens?: number;
  charactersCount?: number;
  audioDurationMs?: number;
  totalRequests?: number;
  [key: string]: unknown;
};
