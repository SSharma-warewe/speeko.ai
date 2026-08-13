import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GhlContactInput,
  GhlCreateAppointmentInput,
  GhlCreateAppointmentResult,
  GhlGetFreeSlotsResult,
  GhlLeadDirection,
  GhlLeadInput,
  GhlUpsertLeadResult,
} from './ghl.types';
import {
  GHL_SLOT_MINUTES,
  mapGhlFreeSlots,
} from './ghl-time';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';
const GHL_SOURCE = 'Speeko Get Demo';
const GHL_DEMO_TAG = 'speeko-get-demo';
const ERROR_BODY_LOG_LIMIT = 400;

/** Marketing country labels → ISO 3166-1 alpha-2 (GHL `country`). */
const COUNTRY_TO_ISO: Record<string, string> = {
  'united states': 'US',
  'united kingdom': 'GB',
  canada: 'CA',
  australia: 'AU',
  germany: 'DE',
  france: 'FR',
  india: 'IN',
  singapore: 'SG',
  'united arab emirates': 'AE',
  netherlands: 'NL',
};

const DIRECTIONS = new Set<GhlLeadDirection>([
  'outbound',
  'inbound',
  'both',
]);

type GhlJson = Record<string, unknown>;

type GhlHttpResult = {
  ok: boolean;
  status: number;
  json: GhlJson | null;
  text: string;
  networkError?: string;
};

type GhlTokenKind = 'contacts' | 'calendar';

@Injectable()
export class GhlService {
  private readonly logger = new Logger(GhlService.name);
  private readonly apiKey: string;
  private readonly calendarToken: string;
  private readonly locationId: string;
  private readonly calendarId: string;
  private disabledLogged = false;
  private calendarDisabledLogged = false;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('GHL_API_KEY')?.trim() ?? '';
    this.calendarToken = this.config.get<string>('GHL_CALENDAR')?.trim() ?? '';
    this.locationId = this.config.get<string>('GHL_LOCATION_ID')?.trim() ?? '';
    this.calendarId = this.config.get<string>('GHL_CALENDAR_ID')?.trim() ?? '';

    if (!this.apiKey || !this.locationId) {
      this.logger.warn(
        'GHL disabled: set GHL_API_KEY and GHL_LOCATION_ID. upsertLead() will no-op.',
      );
    }
    if (!this.calendarToken || !this.locationId || !this.calendarId) {
      this.logger.warn(
        'GHL calendar disabled: set GHL_CALENDAR, GHL_LOCATION_ID, and GHL_CALENDAR_ID.',
      );
    } else {
      this.logger.log(
        `GHL calendar enabled calendarId=${this.calendarId} slotMinutes=${GHL_SLOT_MINUTES}`,
      );
    }
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey && this.locationId);
  }

  isCalendarEnabled(): boolean {
    return Boolean(this.calendarToken && this.locationId && this.calendarId);
  }

  /**
   * Upsert a marketing get-demo lead as a GHL contact, then add tags + a note.
   * Never throws — failures return `{ ok: false }` so the demo dial still runs.
   */
  async upsertLead(input: GhlLeadInput): Promise<GhlUpsertLeadResult> {
    if (!this.isEnabled()) {
      if (!this.disabledLogged) {
        this.logger.warn(
          'GhlService.upsertLead skipped: GHL_API_KEY or GHL_LOCATION_ID not set',
        );
        this.disabledLogged = true;
      }
      return { ok: false, skipped: true, error: 'ghl disabled' };
    }

    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const email = input.email.trim().toLowerCase();
    const phone = input.phone.trim();
    const companyName = input.company.trim();

    if (!email && !phone) {
      this.logger.warn('GhlService.upsertLead rejected: email or phone required');
      return { ok: false, error: 'email or phone is required' };
    }

    const country = toIsoCountry(input.country);
    const direction = DIRECTIONS.has(input.direction)
      ? input.direction
      : undefined;
    const integrations = input.integrations
      .map((i) => i.trim())
      .filter(Boolean);

    const body: GhlJson = {
      locationId: this.locationId,
      source: GHL_SOURCE,
    };
    if (firstName) body.firstName = firstName;
    if (lastName) body.lastName = lastName;
    if (email) body.email = email;
    if (phone) body.phone = phone;
    if (companyName) body.companyName = companyName;
    if (country) body.country = country;

    const upsert = await this.request('POST', '/contacts/upsert', body);
    if (upsert.networkError) {
      this.logger.warn(`GHL upsert network error: ${upsert.networkError}`);
      return { ok: false, error: upsert.networkError };
    }
    if (!upsert.ok) {
      this.logger.warn(
        `GHL upsert failed: status=${upsert.status} body=${truncate(upsert.text)}`,
      );
      return { ok: false, error: `ghl upsert ${upsert.status}` };
    }

    const contactId = readContactId(upsert.json);
    if (!contactId) {
      this.logger.warn('GHL upsert succeeded but contact.id was missing');
      return { ok: false, error: 'ghl upsert missing contact.id' };
    }

    const created = upsert.json?.new === true;
    const tags = [GHL_DEMO_TAG];
    if (direction) tags.push(`direction:${direction}`);

    const tagResult = await this.request('POST', `/contacts/${contactId}/tags`, {
      tags,
    });
    if (!tagResult.ok) {
      this.logger.warn(
        `GHL add tags failed for contact=${contactId} status=${tagResult.status} body=${truncate(tagResult.text)}`,
      );
    }

    const noteBody = buildLeadNote({
      teamSize: input.teamSize.trim(),
      callsPerDay: input.callsPerDay.trim(),
      direction,
      integrations,
    });
    if (noteBody) {
      const noteResult = await this.request(
        'POST',
        `/contacts/${contactId}/notes`,
        { body: noteBody },
      );
      if (!noteResult.ok) {
        this.logger.warn(
          `GHL add note failed for contact=${contactId} status=${noteResult.status} body=${truncate(noteResult.text)}`,
        );
      }
    }

    this.logger.log(
      `GHL lead upserted contact=${contactId} created=${created} email=${email || 'n/a'}`,
    );
    return { ok: true, contactId, created };
  }

  /**
   * Upsert a contact for calendar booking (no get-demo tags/notes).
   * Uses GHL_API_KEY (contacts scope).
   */
  async upsertContact(input: GhlContactInput): Promise<GhlUpsertLeadResult> {
    if (!this.isEnabled()) {
      return {
        ok: false,
        skipped: true,
        error: 'contact_upsert_unavailable',
      };
    }

    const firstName = input.firstName?.trim() ?? '';
    const lastName = input.lastName?.trim() ?? '';
    const email = input.email?.trim().toLowerCase() ?? '';
    const phone = input.phone?.trim() ?? '';
    const companyName = input.company?.trim() ?? '';

    if (!email && !phone) {
      this.logger.warn('GhlService.upsertContact rejected: email or phone required');
      return { ok: false, error: 'email or phone is required' };
    }

    const body: GhlJson = {
      locationId: this.locationId,
      source: 'Speeko Voice Agent',
    };
    if (firstName) body.firstName = firstName;
    if (lastName) body.lastName = lastName;
    if (email) body.email = email;
    if (phone) body.phone = phone;
    if (companyName) body.companyName = companyName;

    const upsert = await this.request('POST', '/contacts/upsert', body);
    if (upsert.networkError) {
      this.logger.warn(`GHL contact upsert network error: ${upsert.networkError}`);
      return { ok: false, error: upsert.networkError };
    }
    if (!upsert.ok) {
      this.logger.warn(
        `GHL contact upsert failed: status=${upsert.status} body=${truncate(upsert.text)}`,
      );
      return { ok: false, error: `ghl upsert ${upsert.status}` };
    }

    const contactId = readContactId(upsert.json);
    if (!contactId) {
      this.logger.warn('GHL contact upsert succeeded but contact.id was missing');
      return { ok: false, error: 'ghl upsert missing contact.id' };
    }

    const created = upsert.json?.new === true;
    this.logger.log(
      `GHL contact upserted contact=${contactId} created=${created} email=${email || 'n/a'}`,
    );
    return { ok: true, contactId, created };
  }

  /**
   * Open slots only (GHL free-slots). Never lists existing events.
   * Uses GHL_CALENDAR. startMs/endMs are unix milliseconds.
   */
  async getFreeSlots(input: {
    startMs: number;
    endMs: number;
    timezone?: string;
  }): Promise<GhlGetFreeSlotsResult> {
    if (!this.isCalendarEnabled()) {
      if (!this.calendarDisabledLogged) {
        this.logger.warn(
          'GhlService.getFreeSlots skipped: GHL_CALENDAR, GHL_LOCATION_ID, or GHL_CALENDAR_ID not set',
        );
        this.calendarDisabledLogged = true;
      }
      return {
        ok: false,
        skipped: true,
        error: 'ghl_calendar_disabled',
        message:
          'GHL calendar is not configured. Set GHL_CALENDAR, GHL_LOCATION_ID, and GHL_CALENDAR_ID.',
      };
    }

    const params = new URLSearchParams({
      startDate: String(input.startMs),
      endDate: String(input.endMs),
    });
    if (input.timezone?.trim()) {
      params.set('timezone', input.timezone.trim());
    }
    const path = `/calendars/${this.calendarId}/free-slots?${params.toString()}`;
    const res = await this.request('GET', path, undefined, 'calendar');
    if (res.networkError) {
      this.logger.warn(`GHL free-slots network error: ${res.networkError}`);
      return { ok: false, error: 'network_error', message: res.networkError };
    }
    if (!res.ok) {
      this.logger.warn(
        `GHL free-slots failed: status=${res.status} body=${truncate(res.text)}`,
      );
      return {
        ok: false,
        error: `ghl_free_slots_${res.status}`,
        message: 'Could not load open times from the calendar.',
      };
    }

    const slots = mapGhlFreeSlots(res.json);
    this.logger.log(
      `GHL free-slots calendarId=${this.calendarId} slots=${slots.length} ` +
        `startMs=${input.startMs} endMs=${input.endMs}`,
    );
    return {
      ok: true,
      slotMinutes: GHL_SLOT_MINUTES,
      slots,
      timezone: input.timezone?.trim() || undefined,
    };
  }

  /**
   * Book an appointment on GHL_CALENDAR_ID. Uses GHL_CALENDAR (write).
   * Does not set ignoreFreeSlotValidation — occupied slots stay rejected.
   */
  async createAppointment(
    input: GhlCreateAppointmentInput,
  ): Promise<GhlCreateAppointmentResult> {
    if (!this.isCalendarEnabled()) {
      return {
        ok: false,
        skipped: true,
        error: 'ghl_calendar_disabled',
        message:
          'GHL calendar is not configured. Set GHL_CALENDAR, GHL_LOCATION_ID, and GHL_CALENDAR_ID.',
      };
    }

    const body: GhlJson = {
      calendarId: this.calendarId,
      locationId: this.locationId,
      contactId: input.contactId,
      startTime: input.startTime,
      toNotify: true,
    };
    if (input.endTime) body.endTime = input.endTime;
    if (input.title?.trim()) body.title = input.title.trim();
    if (input.description?.trim()) body.description = input.description.trim();

    const res = await this.request(
      'POST',
      '/calendars/events/appointments',
      body,
      'calendar',
    );
    if (res.networkError) {
      this.logger.warn(`GHL create appointment network error: ${res.networkError}`);
      return { ok: false, error: 'network_error', message: res.networkError };
    }
    if (!res.ok) {
      const slotBusy = res.status === 400;
      this.logger.warn(
        `GHL create appointment failed: status=${res.status} body=${truncate(res.text)}`,
      );
      return {
        ok: false,
        error: slotBusy ? 'slot_unavailable' : `ghl_appointment_${res.status}`,
        message: slotBusy
          ? 'That time is no longer open. Check free slots again and pick another time.'
          : 'Could not book the meeting on the calendar.',
      };
    }

    const appointmentId = readAppointmentId(res.json);
    if (!appointmentId) {
      this.logger.warn('GHL create appointment succeeded but id was missing');
      return { ok: false, error: 'ghl_appointment_missing_id' };
    }

    const startTime =
      readString(res.json, 'startTime') ?? input.startTime;
    const endTime = readString(res.json, 'endTime') ?? input.endTime;
    const title = readString(res.json, 'title') ?? input.title;
    this.logger.log(
      `GHL appointment created id=${appointmentId} start=${startTime}`,
    );
    return { ok: true, appointmentId, startTime, endTime, title };
  }

  private async request(
    method: string,
    path: string,
    body?: GhlJson,
    tokenKind: GhlTokenKind = 'contacts',
  ): Promise<GhlHttpResult> {
    const token = tokenKind === 'calendar' ? this.calendarToken : this.apiKey;
    try {
      const response = await fetch(`${GHL_API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Version: GHL_API_VERSION,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await response.text().catch(() => '');
      return {
        ok: response.ok,
        status: response.status,
        json: parseJson(text),
        text,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        status: 0,
        json: null,
        text: '',
        networkError: message,
      };
    }
  }
}

export function toIsoCountry(raw: string): string | undefined {
  const key = raw.trim().toLowerCase();
  if (!key || key === 'other') return undefined;
  if (/^[a-z]{2}$/.test(key)) return key.toUpperCase();
  return COUNTRY_TO_ISO[key];
}

export function buildLeadNote(input: {
  teamSize: string;
  callsPerDay: string;
  direction?: GhlLeadDirection;
  integrations: string[];
}): string {
  const lines: string[] = [];
  if (input.teamSize) lines.push(`Team size: ${input.teamSize}`);
  if (input.callsPerDay) lines.push(`Calls per day: ${input.callsPerDay}`);
  if (input.direction) lines.push(`Direction: ${input.direction}`);
  if (input.integrations.length > 0) {
    lines.push(`Integrations: ${input.integrations.join(', ')}`);
  }
  return lines.join('\n');
}

function readContactId(json: GhlJson | null): string | undefined {
  const contact = json?.contact;
  if (!contact || typeof contact !== 'object' || Array.isArray(contact)) {
    return undefined;
  }
  const id = (contact as { id?: unknown }).id;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

function readAppointmentId(json: GhlJson | null): string | undefined {
  const direct = readString(json, 'id');
  if (direct) return direct;
  for (const key of ['appointment', 'event'] as const) {
    const nested = json?.[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const id = (nested as { id?: unknown }).id;
      if (typeof id === 'string' && id.trim()) return id.trim();
    }
  }
  return undefined;
}

function readString(
  json: GhlJson | null,
  key: string,
): string | undefined {
  const value = json?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseJson(text: string): GhlJson | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as GhlJson;
  } catch {
    return null;
  }
}

function truncate(text: string): string {
  if (text.length <= ERROR_BODY_LOG_LIMIT) return text;
  return `${text.slice(0, ERROR_BODY_LOG_LIMIT)}…`;
}
