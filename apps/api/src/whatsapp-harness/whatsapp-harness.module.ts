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
import { WhatsAppOutbox } from './whatsapp-outbox.entity';
import { WhatsAppToolOperation } from './whatsapp-tool-operation.entity';
import { WhatsAppHarnessRepository } from './whatsapp-harness.repository';
import { WhatsAppHarnessService } from './whatsapp-harness.service';
import { WhatsAppTickerService } from './whatsapp-ticker.service';
import { InternalWhatsAppHarnessController } from './internal-whatsapp-harness.controller';
import { UserWhatsAppConversationsController } from './user-whatsapp-conversations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsAppConversation,
      WhatsAppTurn,
      WhatsAppOutbox,
      WhatsAppToolOperation,
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
  ],
  controllers: [
    InternalWhatsAppHarnessController,
    UserWhatsAppConversationsController,
  ],
  exports: [WhatsAppHarnessService],
})
export class WhatsAppHarnessModule {}
