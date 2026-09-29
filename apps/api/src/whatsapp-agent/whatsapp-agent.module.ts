import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { MetaWhatsAppModule } from '../meta-whatsapp/meta-whatsapp.module';
import { OrganizationIntegrationsModule } from '../organization-integrations/organization-integrations.module';
import { RECEPTIONIST_REPLY } from './receptionist-reply';
import { WhatsAppAgentController } from './whatsapp-agent.controller';
import { WhatsAppAgentService } from './whatsapp-agent.service';
import { WhatsAppLunaRunner } from './whatsapp-luna.runner';
import { WhatsAppTextClient } from './whatsapp-text.client';
import { WhatsAppBookingService } from './whatsapp-booking.service';

@Module({
  imports: [AgentsModule, OrganizationIntegrationsModule, MetaWhatsAppModule],
  controllers: [WhatsAppAgentController],
  providers: [
    WhatsAppTextClient,
    WhatsAppBookingService,
    WhatsAppLunaRunner,
    { provide: RECEPTIONIST_REPLY, useExisting: WhatsAppLunaRunner },
    WhatsAppAgentService,
  ],
  exports: [WhatsAppAgentService],
})
export class WhatsAppAgentModule {}
