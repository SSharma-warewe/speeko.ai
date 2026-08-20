import { BadRequestException } from '@nestjs/common';
import { DEFAULT_TASK_KEY } from '../tools/known-tools';
import { Agent, AgentDirection } from './agent.entity';
import { OrganizationAgent } from './organization-agent.entity';

export const OUTBOUND_NO_DEFAULT_TASK =
  'Outbound agents do not have a default task; set task on the call or integration.';

export const INBOUND_TASK_REQUIRED = 'Inbound agents require a default task.';

export function isOutboundTemplate(
  template: Pick<Agent, 'direction'> | null | undefined,
): boolean {
  return template?.direction === AgentDirection.OUTBOUND;
}

/**
 * Persist rule for org agent `default_task_key`.
 * Outbound: always null (reject if the client sent one).
 * Inbound: dto, else template, else `general`.
 */
export function storedDefaultTaskKey(
  direction: AgentDirection,
  requested: string | null | undefined,
  templateDefault?: string | null,
): string | null {
  if (direction === AgentDirection.OUTBOUND) {
    if (requested?.trim()) {
      throw new BadRequestException(OUTBOUND_NO_DEFAULT_TASK);
    }
    return null;
  }
  return requested?.trim() || templateDefault?.trim() || DEFAULT_TASK_KEY;
}

/**
 * Runtime / response default.
 * Outbound org agents never expose a default (leftover column values ignored).
 * Inbound: stored key, then template, then `general`.
 */
export function orgAgentDefaultTaskKey(
  orgAgent: Pick<OrganizationAgent, 'defaultTaskKey'> & {
    agent?: Agent | null;
  },
  template?: Pick<Agent, 'direction' | 'defaultTaskKey'> | null,
): string | null {
  const resolved = template ?? orgAgent.agent ?? null;
  if (!resolved || resolved.direction === AgentDirection.OUTBOUND) {
    return null;
  }
  const stored = orgAgent.defaultTaskKey?.trim();
  if (stored) return stored;
  const fallback = resolved.defaultTaskKey?.trim();
  return fallback || DEFAULT_TASK_KEY;
}
