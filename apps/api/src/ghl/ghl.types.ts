export type GhlLeadDirection = 'outbound' | 'inbound' | 'both';

export type GhlLeadInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  country: string;
  teamSize: string;
  callsPerDay: string;
  direction: GhlLeadDirection;
  integrations: string[];
};

export type GhlUpsertLeadResult =
  | { ok: true; contactId: string; created: boolean }
  | { ok: false; error: string; skipped?: boolean };
