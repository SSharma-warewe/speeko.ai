import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationIntegration } from '../organization-integrations/organization-integration.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ToolsModule } from '../tools/tools.module';
import { Agent } from './agent.entity';
import { AgentSeedService } from './agent-seed.service';
import { AgentsController } from './agents.controller';
import { AgentsRepository } from './agents.repository';
import { AgentsService } from './agents.service';
import { InternalOrganizationAgentsController } from './internal-organization-agents.controller';
import { OrganizationAgent } from './organization-agent.entity';
import { OrganizationAgentsController } from './organization-agents.controller';
import { OrganizationAgentsRepository } from './organization-agents.repository';
import { OrganizationAgentsService } from './organization-agents.service';
import { UserOrganizationAgentsController } from './user-organization-agents.controller';

@Module({
  imports: [
    // OrganizationIntegration entity only — avoids importing OrganizationIntegrationsModule
    // (that module imports AgentsModule for calendar tools → circular crash).
    TypeOrmModule.forFeature([Agent, OrganizationAgent, OrganizationIntegration]),
    OrganizationsModule,
    ToolsModule,
  ],
  controllers: [
    AgentsController,
    OrganizationAgentsController,
    UserOrganizationAgentsController,
    InternalOrganizationAgentsController,
  ],
  providers: [
    AgentsRepository,
    OrganizationAgentsRepository,
    AgentsService,
    OrganizationAgentsService,
    AgentSeedService,
  ],
  exports: [AgentsService, OrganizationAgentsService],
})
export class AgentsModule {}
