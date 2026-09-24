import { Module } from '@nestjs/common';
import { RECEPTIONIST_REPLY } from './receptionist-reply';
import { WhatsAppAgentService } from './whatsapp-agent.service';
import { WhatsAppLunaRunner } from './whatsapp-luna.runner';
import { WhatsAppTextClient } from './whatsapp-text.client';

@Module({
  providers: [
    WhatsAppTextClient,
    WhatsAppLunaRunner,
    { provide: RECEPTIONIST_REPLY, useExisting: WhatsAppLunaRunner },
    WhatsAppAgentService,
  ],
  exports: [WhatsAppAgentService],
})
export class WhatsAppAgentModule {}
