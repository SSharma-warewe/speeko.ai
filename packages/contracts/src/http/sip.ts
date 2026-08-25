import type {
  PublishResourceOutcome,
  SipDispatchRuleType,
  SipResourceStatus,
  SipTrunkDirection,
} from '../sip.js';

export type SipTrunk = {
  id: string;
  organizationId: string;
  name: string;
  direction: SipTrunkDirection;
  providerAddress: string | null;
  authUsername: string | null;
  numbers: string[];
  allowedNumbers: string[];
  allowedAddresses: string[];
  krispEnabled: boolean;
  livekitTrunkId: string | null;
  status: SipResourceStatus;
  isActive: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateOutboundSipTrunkRequest = {
  name: string;
  numbers: string[];
  livekitTrunkId?: string;
  providerAddress?: string;
  authUsername?: string;
  authPassword?: string;
  isActive?: boolean;
  destinationCountry?: string;
};

export type UpdateOutboundSipTrunkRequest = {
  name?: string;
  numbers?: string[];
  isActive?: boolean;
  authUsername?: string;
  authPassword?: string;
};

export type CreateInboundSipTrunkRequest = {
  name: string;
  numbers: string[];
  allowedNumbers?: string[];
  allowedAddresses?: string[];
  authUsername?: string;
  authPassword?: string;
  krispEnabled?: boolean;
  isActive?: boolean;
  livekitTrunkId?: string;
};

export type UpdateInboundSipTrunkRequest = {
  name?: string;
  numbers?: string[];
  allowedNumbers?: string[];
  allowedAddresses?: string[];
  authUsername?: string;
  authPassword?: string;
  krispEnabled?: boolean;
  isActive?: boolean;
};

export type SipDispatchRule = {
  id: string;
  organizationId: string;
  name: string;
  ruleType: SipDispatchRuleType;
  roomPrefix: string | null;
  roomName: string | null;
  pin: string | null;
  randomize: boolean;
  sipTrunkIds: string[];
  hidePhoneNumber: boolean;
  attributes: Record<string, string> | null;
  metadata: string | null;
  organizationAgentId: string | null;
  agentName: string | null;
  livekitDispatchRuleId: string | null;
  status: SipResourceStatus;
  isActive: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateSipDispatchRuleRequest = {
  name: string;
  ruleType?: SipDispatchRuleType;
  roomPrefix?: string;
  roomName?: string;
  pin?: string;
  randomize?: boolean;
  sipTrunkIds?: string[];
  hidePhoneNumber?: boolean;
  organizationAgentId?: string;
  agentName?: string;
  isActive?: boolean;
};

export type UpdateSipDispatchRuleRequest = {
  name?: string;
  ruleType?: SipDispatchRuleType;
  roomPrefix?: string | null;
  roomName?: string | null;
  pin?: string | null;
  randomize?: boolean;
  sipTrunkIds?: string[];
  hidePhoneNumber?: boolean;
  organizationAgentId?: string | null;
  agentName?: string | null;
  isActive?: boolean;
};

export type PublishResourceResult = {
  id: string;
  outcome: PublishResourceOutcome;
  message?: string;
  livekitId?: string | null;
};

export type InboundPublishResult = {
  trunks: PublishResourceResult[];
  dispatchRules: PublishResourceResult[];
  publishedTrunks?: SipTrunk[];
  publishedDispatchRules?: SipDispatchRule[];
};

export type PublishInboundRequest = {
  sipTrunkIds?: string[];
  dispatchRuleIds?: string[];
};
