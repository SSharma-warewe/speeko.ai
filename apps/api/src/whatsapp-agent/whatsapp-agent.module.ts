import { Module } from '@nestjs/common';
import { MetaWhatsAppModule } from '../meta-whatsapp/meta-whatsapp.module';
import { OrganizationIntegrationsModule } from '../organization-integrations/organization-integrations.module';
import { RECEPTIONIST_REPLY } from './receptionist-reply';
import { WhatsAppAgentController } from './whatsapp-agent.controller';
import { WhatsAppAgentService } from './whatsapp-agent.service';
import { WhatsAppLunaRunner } from './whatsapp-luna.runner';
import { WhatsAppTextClient } from './whatsapp-text.client';

@Module({
  imports: [OrganizationIntegrationsModule, MetaWhatsAppModule],
  controllers: [WhatsAppAgentController],
  providers: [
    WhatsAppTextClient,
    WhatsAppLunaRunner,
    { provide: RECEPTIONIST_REPLY, useExisting: WhatsAppLunaRunner },
    WhatsAppAgentService,
  ],
  exports: [WhatsAppAgentService],
})
export class WhatsAppAgentModule {}
