import { Module } from '@nestjs/common';
import { MetaWhatsAppClient } from './meta-whatsapp.client';
import { PlatformWhatsAppConfig } from './platform-whatsapp.config';

/**
 * Infrastructure adapter for Meta WhatsApp Cloud API with org-owned tokens.
 * Not a repository-backed domain module.
 */
@Module({
  providers: [MetaWhatsAppClient, PlatformWhatsAppConfig],
  exports: [MetaWhatsAppClient, PlatformWhatsAppConfig],
})
export class MetaWhatsAppModule {}
