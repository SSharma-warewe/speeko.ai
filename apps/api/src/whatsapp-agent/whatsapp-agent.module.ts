import { Module } from '@nestjs/common';
import { OrganizationIntegrationsModule } from '../organization-integrations/organization-integrations.module';
import { WhatsAppAgentController } from './whatsapp-agent.controller';

@Module({
  imports: [OrganizationIntegrationsModule],
  controllers: [WhatsAppAgentController],
})
export class WhatsAppAgentModule {}
