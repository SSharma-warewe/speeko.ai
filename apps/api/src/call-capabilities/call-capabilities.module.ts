import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Call } from '../calls/call.entity';
import { Organization } from '../organizations/organization.entity';
import { OrganizationAgent } from '../agents/organization-agent.entity';
import { Agent } from '../agents/agent.entity';
import { OrganizationIntegration } from '../organization-integrations/organization-integration.entity';
import { ToolProfile } from '../tools/tool-profile.entity';
import { ToolProfileTool } from '../tools/tool-profile-tool.entity';
import { CallCapabilityAuthorizationRepository } from './call-capability-authorization.repository';
import { CallCapabilityAuthorizationService } from './call-capability-authorization.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Call,
      Organization,
      OrganizationAgent,
      Agent,
      OrganizationIntegration,
      ToolProfile,
      ToolProfileTool,
    ]),
  ],
  providers: [
    CallCapabilityAuthorizationRepository,
    CallCapabilityAuthorizationService,
  ],
  exports: [CallCapabilityAuthorizationService],
})
export class CallCapabilitiesModule {}
