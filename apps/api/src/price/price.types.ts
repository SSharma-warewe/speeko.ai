import type {
  CallCostAttempt,
  CallCostLine,
  CallCostSnapshot,
  CostLineKey,
  CostUnit,
  PricingPlan,
} from '@call-agent/contracts';

export type {
  CallCostAttempt,
  CallCostLine,
  CallCostSnapshot,
  CostLineKey,
  CostUnit,
  PricingPlan,
};

export type PriceAttemptInput = {
  executionType?: 'agent' | 'human';
  browserJoinedAt?: Date | string | null;
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
