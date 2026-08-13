/**
 * Get-demo form allowlists. Keep in sync with apps/web/src/pages/GetDemoPage.tsx.
 */
export const DEMO_COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'India',
  'Singapore',
  'United Arab Emirates',
  'Netherlands',
  'Other',
] as const;

export const DEMO_TEAM_SIZES = [
  '1–10',
  '11–50',
  '51–200',
  '201–1000',
  '1000+',
] as const;

export const DEMO_CALLS_PER_DAY = [
  'Under 50',
  '50–200',
  '200–1000',
  '1000+',
] as const;

export const DEMO_DIRECTIONS = ['outbound', 'inbound', 'both'] as const;

export const DEMO_INTEGRATION_OPTIONS = [
  'Google Calendar',
  'Outlook',
  'Salesforce',
  'HubSpot',
  'Zendesk',
  'Custom / API',
  'Not sure yet',
] as const;

export type DemoCountry = (typeof DEMO_COUNTRIES)[number];
export type DemoTeamSize = (typeof DEMO_TEAM_SIZES)[number];
export type DemoCallsPerDay = (typeof DEMO_CALLS_PER_DAY)[number];
export type DemoDirection = (typeof DEMO_DIRECTIONS)[number];
export type DemoIntegration = (typeof DEMO_INTEGRATION_OPTIONS)[number];

/** Strip grouping characters; keep a leading +. */
export function stripDemoPhone(value: string): string {
  return value.replace(/[\s\-().]/g, '');
}

export function demoPhoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}
