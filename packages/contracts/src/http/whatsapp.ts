export type WhatsAppWebhookConfig = {
  id: string;
  organizationId: string;
  callbackUrl: string;
  verifyTokenPrefix: string;
  phoneNumberId: string | null;
  wabaId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Generate / rotate response: includes the raw verify token once. */
export type WhatsAppWebhookConfigSecret = WhatsAppWebhookConfig & {
  verifyToken: string;
};

export type GenerateWhatsAppWebhookConfigRequest = {
  phoneNumberId?: string;
  wabaId?: string;
};

export type WhatsAppWebhookAck = {
  success: true;
};
