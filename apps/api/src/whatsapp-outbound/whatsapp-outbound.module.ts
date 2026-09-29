import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaWhatsAppModule } from '../meta-whatsapp/meta-whatsapp.module';
import { OrganizationIntegrationsModule } from '../organization-integrations/organization-integrations.module';
import { WhatsAppOutboundMessage } from './whatsapp-outbound-message.entity';
import { WhatsAppOutboundMessagesRepository } from './whatsapp-outbound-messages.repository';
import { WhatsAppOutboundController } from './whatsapp-outbound.controller';
import { WhatsAppOutboundService } from './whatsapp-outbound.service';

/**
 * Org-owned WhatsApp template sends to contacts imported live from
 * GoHighLevel. Credentials live on `organization_integrations`
 * (`whatsapp`, `ghl_contacts`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsAppOutboundMessage]),
    OrganizationIntegrationsModule,
    MetaWhatsAppModule,
  ],
  controllers: [WhatsAppOutboundController],
  providers: [WhatsAppOutboundMessagesRepository, WhatsAppOutboundService],
})
export class WhatsAppOutboundModule {}
