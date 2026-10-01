export const IntegrationProvider = {
  NYLAS: 'nylas',
  GHL: 'ghl',
  /** Live HighLevel CRM workspace, separate from agent calendar connections. */
  GHL_CRM: 'ghl_crm',
  /** GoHighLevel PIT used only to import contacts for WhatsApp outbound. */
  GHL_CONTACTS: 'ghl_contacts',
  /** Meta WhatsApp Cloud API credentials (access token + phone number id + WABA id). */
  WHATSAPP: 'whatsapp',
} as const;
export type IntegrationProvider =
  (typeof IntegrationProvider)[keyof typeof IntegrationProvider];

/** Providers used by agent calendar tools (Nylas / GHL calendar). */
export const CALENDAR_INTEGRATION_PROVIDERS: readonly IntegrationProvider[] = [
  IntegrationProvider.NYLAS,
  IntegrationProvider.GHL,
];

export function isCalendarIntegrationProvider(
  provider: IntegrationProvider,
): boolean {
  return CALENDAR_INTEGRATION_PROVIDERS.includes(provider);
}
