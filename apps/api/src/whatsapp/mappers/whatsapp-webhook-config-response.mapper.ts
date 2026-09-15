import { WhatsAppWebhookConfig } from '../whatsapp-webhook-config.entity';
import {
  WhatsAppWebhookConfigResponseDto,
  WhatsAppWebhookConfigSecretResponseDto,
} from '../dto/whatsapp-webhook-config-response.dto';

/** Public GET/POST path: global prefix `api` + `webhooks/whatsapp`. */
export const WHATSAPP_WEBHOOK_PATH = '/api/webhooks/whatsapp';

export type WhatsAppCallbackUrlOptions = {
  /** Public HTTPS origin Meta should call (not the worker's private API_BASE_URL). */
  publicUrl?: string | null;
  /** Railway-injected hostname, e.g. `api-production-4df4.up.railway.app`. */
  railwayPublicDomain?: string | null;
};

/**
 * Origin Meta can reach. Prefer `API_PUBLIC_URL`, then a public `API_BASE_URL`,
 * then `https://{RAILWAY_PUBLIC_DOMAIN}`. Never emit `*.railway.internal`.
 */
export function resolvePublicApiOrigin(
  apiBaseUrl?: string | null,
  options?: WhatsAppCallbackUrlOptions,
): string {
  const explicit = normalizePublicOrigin(options?.publicUrl);
  if (explicit) {
    return explicit;
  }

  const apiBase = normalizePublicOrigin(apiBaseUrl);
  if (apiBase && !isPrivateCallbackHost(apiBase)) {
    return apiBase;
  }

  const domain = options?.railwayPublicDomain
    ?.trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '');
  if (domain) {
    return `https://${domain}`;
  }

  return apiBase ?? '';
}

export function whatsappCallbackUrl(
  apiBaseUrl?: string | null,
  options?: WhatsAppCallbackUrlOptions,
): string {
  const origin = resolvePublicApiOrigin(apiBaseUrl, options);
  return origin
    ? `${origin}${WHATSAPP_WEBHOOK_PATH}`
    : WHATSAPP_WEBHOOK_PATH;
}

function normalizePublicOrigin(url?: string | null): string {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/\/$/, '').replace(/\/api$/i, '');
}

function isPrivateCallbackHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.endsWith('.railway.internal') ||
      host.endsWith('.internal') ||
      host === 'host.docker.internal'
    );
  } catch {
    return false;
  }
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
