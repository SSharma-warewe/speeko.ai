import { Module } from '@nestjs/common';
import { MetaWhatsAppClient } from './meta-whatsapp.client';

/**
 * Infrastructure adapter for Meta WhatsApp Cloud API with org-owned tokens.
 * Not a repository-backed domain module.
 */
@Module({
  providers: [MetaWhatsAppClient],
  exports: [MetaWhatsAppClient],
})
export class MetaWhatsAppModule {}
