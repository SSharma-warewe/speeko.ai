import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PublicWhatsAppWebhooksController } from './public-whatsapp-webhooks.controller';
import { UserWhatsAppWebhooksController } from './user-whatsapp-webhooks.controller';
import { WhatsAppWebhookConfig } from './whatsapp-webhook-config.entity';
import { WhatsAppWebhookEvent } from './whatsapp-webhook-event.entity';
import { WhatsAppWebhookConfigsRepository } from './whatsapp-webhook-configs.repository';
import { WhatsAppWebhookEventsRepository } from './whatsapp-webhook-events.repository';
import { WhatsAppWebhooksService } from './whatsapp-webhooks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsAppWebhookConfig, WhatsAppWebhookEvent]),
    OrganizationsModule,
  ],
  controllers: [
    UserWhatsAppWebhooksController,
    PublicWhatsAppWebhooksController,
  ],
  providers: [
    WhatsAppWebhookConfigsRepository,
    WhatsAppWebhookEventsRepository,
    WhatsAppWebhooksService,
  ],
})
export class WhatsappModule {}
