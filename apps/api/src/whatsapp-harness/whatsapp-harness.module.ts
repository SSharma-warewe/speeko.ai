import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsModule } from '../agents/agents.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { OrganizationIntegrationsModule } from '../organization-integrations/organization-integrations.module';
import { ToolsModule } from '../tools/tools.module';
import { MetaWhatsAppModule } from '../meta-whatsapp/meta-whatsapp.module';
import { WhatsAppBookingService } from '../whatsapp-agent/whatsapp-booking.service';
import { WhatsAppConversation } from './whatsapp-conversation.entity';
import { WhatsAppTurn } from './whatsapp-turn.entity';
import { WhatsAppTaskSession } from './whatsapp-task-session.entity';
import { WhatsAppOutbox } from './whatsapp-outbox.entity';
import { WhatsAppToolOperation } from './whatsapp-tool-operation.entity';
import { WhatsAppHarnessRepository } from './whatsapp-harness.repository';
import { WhatsAppHarnessService } from './whatsapp-harness.service';
import { WhatsAppTickerService } from './whatsapp-ticker.service';
import { InternalWhatsAppHarnessController } from './internal-whatsapp-harness.controller';
import { UserWhatsAppConversationsController } from './user-whatsapp-conversations.controller';
import { OtpChallenge } from '../otp/otp-challenge.entity';
import { OtpDeliveryRepository } from './otp-delivery.repository';
import { OtpDeliveryService } from './otp-delivery.service';
import { AdminWhatsAppHarnessController } from './admin-whatsapp-harness.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsAppConversation,
      WhatsAppTurn,
      WhatsAppTaskSession,
      WhatsAppOutbox,
      WhatsAppToolOperation,
      OtpChallenge,
    ]),
    AgentsModule,
    OrganizationsModule,
    OrganizationIntegrationsModule,
    ToolsModule,
    MetaWhatsAppModule,
  ],
  providers: [
    WhatsAppHarnessRepository,
    WhatsAppHarnessService,
    WhatsAppTickerService,
    WhatsAppBookingService,
    OtpDeliveryRepository,
    OtpDeliveryService,
  ],
  controllers: [
    InternalWhatsAppHarnessController,
    UserWhatsAppConversationsController,
    AdminWhatsAppHarnessController,
  ],
  exports: [WhatsAppHarnessService, OtpDeliveryService],
})
export class WhatsAppHarnessModule {}
