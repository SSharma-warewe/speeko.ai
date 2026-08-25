export const IntegrationProvider = {
  NYLAS: 'nylas',
  GHL: 'ghl',
} as const;
export type IntegrationProvider =
  (typeof IntegrationProvider)[keyof typeof IntegrationProvider];
