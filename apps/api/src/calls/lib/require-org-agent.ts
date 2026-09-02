import { BadRequestException } from '@nestjs/common';
import { Agent } from '../../agents/agent.entity';
import { OrganizationAgent } from '../../agents/organization-agent.entity';
import { OrganizationAgentsService } from '../../agents/organization-agents.service';

export async function requireActiveOrgAgent(
  organizationAgents: Pick<OrganizationAgentsService, 'getEntityWithTemplate'>,
  organizationId: string,
  organizationAgentId: string,
): Promise<{ orgAgent: OrganizationAgent; template: Agent }> {
  const orgAgent = await organizationAgents.getEntityWithTemplate(
    organizationId,
    organizationAgentId,
  );
  if (!orgAgent.isActive) {
    throw new BadRequestException(
      `Organization agent is inactive: ${organizationAgentId}`,
    );
  }
  const template = orgAgent.agent;
  if (!template) {
    throw new BadRequestException(
      `Organization agent missing template relation: ${orgAgent.id}`,
    );
  }
  return { orgAgent, template };
}
