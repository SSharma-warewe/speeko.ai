import { WhatsAppWebhookConfig } from '../whatsapp-webhook-config.entity';
import {
  WhatsAppWebhookConfigResponseDto,
  WhatsAppWebhookConfigSecretResponseDto,
} from '../dto/whatsapp-webhook-config-response.dto';

export function whatsappCallbackUrl(apiBaseUrl?: string | null): string {
  const path = '/api/webhooks/whatsapp';
  const base = apiBaseUrl?.trim().replace(/\/$/, '') ?? '';
  return base ? `${base}${path}` : path;
}

/** Map entity → response; never include verifyToken or verifyTokenHash. */
export function toWhatsAppWebhookConfigResponse(
  row: WhatsAppWebhookConfig,
  callbackUrl: string,
): WhatsAppWebhookConfigResponseDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    callbackUrl,
    verifyTokenPrefix: row.verifyTokenPrefix,
    phoneNumberId: row.phoneNumberId ?? null,
    wabaId: row.wabaId ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toWhatsAppWebhookConfigSecretResponse(
  row: WhatsAppWebhookConfig,
  callbackUrl: string,
  verifyToken: string,
): WhatsAppWebhookConfigSecretResponseDto {
  return {
    ...toWhatsAppWebhookConfigResponse(row, callbackUrl),
    verifyToken,
  };
}
