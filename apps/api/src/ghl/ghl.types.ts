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

export type GhlContactInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
};

export type GhlFreeSlot = {
  startIso: string;
  endIso: string;
};

export type GhlGetFreeSlotsResult =
  | {
      ok: true;
      slotMinutes: number;
      slots: GhlFreeSlot[];
      timezone?: string;
    }
  | { ok: false; error: string; skipped?: boolean; message?: string };

export type GhlCreateAppointmentInput = {
  contactId: string;
  startTime: string;
  endTime?: string;
  title?: string;
  description?: string;
};

export type GhlCreateAppointmentResult =
  | {
      ok: true;
      appointmentId: string;
      startTime: string;
      endTime?: string;
      title?: string;
    }
  | { ok: false; error: string; message?: string; skipped?: boolean };
