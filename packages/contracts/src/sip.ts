export const SipTrunkDirection = {
  OUTBOUND: 'outbound',
  INBOUND: 'inbound',
} as const;
export type SipTrunkDirection =
  (typeof SipTrunkDirection)[keyof typeof SipTrunkDirection];

export const SipResourceStatus = {
  DRAFT: 'draft',
  LIVE: 'live',
} as const;
export type SipResourceStatus =
  (typeof SipResourceStatus)[keyof typeof SipResourceStatus];

export const SipDispatchRuleType = {
  INDIVIDUAL: 'individual',
  DIRECT: 'direct',
  CALLEE: 'callee',
} as const;
export type SipDispatchRuleType =
  (typeof SipDispatchRuleType)[keyof typeof SipDispatchRuleType];

export const PublishResourceOutcome = {
  PUBLISHED: 'published',
  SKIPPED: 'skipped',
  FAILED: 'failed',
} as const;
export type PublishResourceOutcome =
  (typeof PublishResourceOutcome)[keyof typeof PublishResourceOutcome];
