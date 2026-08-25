/**
 * Get-demo form allowlists — owned by @call-agent/contracts.
 * Phone helpers stay here (DTO transform only).
 */
export {
  DEMO_CALLS_PER_DAY,
  DEMO_COUNTRIES,
  DEMO_DIRECTIONS,
  DEMO_INTEGRATION_OPTIONS,
  DEMO_TEAM_SIZES,
} from '@call-agent/contracts';
export type {
  DemoCallsPerDay,
  DemoCountry,
  DemoDirection,
  DemoIntegration,
  DemoTeamSize,
} from '@call-agent/contracts';

/** Strip grouping characters; keep a leading +. */
export function stripDemoPhone(value: string): string {
  return value.replace(/[\s\-().]/g, '');
}

export function demoPhoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}
