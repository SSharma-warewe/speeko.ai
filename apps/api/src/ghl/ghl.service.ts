import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GhlCalendarCreds,
  GhlContactCreds,
  GhlContactInput,
  GhlContactSummary,
  GhlListContactsInput,
  GhlListContactsResult,
  GhlCreateAppointmentInput,
  GhlCreateAppointmentResult,
  GhlGetFreeSlotsResult,
  GhlLeadDirection,
  GhlLeadInput,
  GhlListCalendarsResult,
  GhlLookupContactInput,
  GhlLookupContactResult,
  GhlUpsertLeadResult,
} from './ghl.types';
import { GHL_SLOT_MINUTES, mapGhlFreeSlots } from './ghl-time';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';
const GHL_SOURCE = 'Speeko Get Demo';
const GHL_DEMO_TAG = 'speeko-get-demo';
const ERROR_BODY_LOG_LIMIT = 400;

/** Static permission hints: never use upstream error text or record identifiers. */
function crmRequiredScope(method: string, path: string): string | undefined {
  const read = method === 'GET';
  if (path.startsWith('/contacts/'))
    return read ? 'contacts.readonly' : 'contacts.write';
  if (path.startsWith('/calendars/'))
    return !read
      ? 'calendars/events.write'
      : path.startsWith('/calendars/events')
        ? 'calendars/events.readonly'
        : 'calendars.readonly';
  if (path.startsWith('/opportunities/'))
    return read ? 'opportunities.readonly' : 'opportunities.write';
  if (path.startsWith('/conversations/'))
    return !read
      ? 'conversations/message.write'
      : path.includes('/messages')
        ? 'conversations/message.readonly'
        : 'conversations.readonly';
  if (path.startsWith('/workflows/')) return 'workflows.readonly';
  if (path.startsWith('/users/')) return 'users.readonly';
  if (path.startsWith('/locations/') && path.endsWith('/tags'))
    return 'locations/tags.readonly';
  if (path.startsWith('/locations/') && path.endsWith('/customFields'))
    return 'locations/customFields.readonly';
  return undefined;
}

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

const DIRECTIONS = new Set<GhlLeadDirection>(['outbound', 'inbound', 'both']);

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
  /** Portal CRM transport. No env fallback, redirects, raw error bodies, or write retries. */
  async crmRequest(
    creds: GhlContactCreds,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
    version = '2021-07-28',
  ): Promise<Record<string, unknown>> {
    if (!creds.token.trim() || !creds.locationId.trim()) {
      throw new BadRequestException('CRM token and location ID are required.');
    }
    if (
      !path.startsWith('/') ||
      path.startsWith('//') ||
      /[\\\r\n]/.test(path)
    ) {
      throw new BadRequestException('Invalid CRM resource path.');
    }
    let response: Response;
    try {
      response = await fetch(`${GHL_API_BASE}${path}`, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${creds.token}`,
          Version: version,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new BadGatewayException(
        method === 'GET'
          ? 'HighLevel is unavailable. Please try refreshing.'
          : 'HighLevel did not confirm this change. Refresh the record before trying again; it may have been saved.',
      );
    }
    if (response.status === 401 || response.status === 403) {
      const scope = crmRequiredScope(method, path);
      throw new ForbiddenException(
        `HighLevel denied access.${scope ? ` This operation requires ${scope}.` : ''} Check the token and location ID saved in Integrations → CRM. If you created a new token, edit that CRM connection and save the replacement token there.`,
      );
    }
    if (response.status === 404)
      throw new NotFoundException('CRM record not found');
    if (response.status === 429)
      throw new HttpException(
        'HighLevel rate limit reached. Wait before refreshing or saving again.',
        429,
      );
    if (!response.ok) {
      // Upstream validation/errors can echo tokens and personal data: never forward them.
      if (response.status === 400 || response.status === 422)
        throw new BadRequestException(
          'HighLevel rejected these fields. Check required values, duplicates, and calendar availability.',
        );
      if (response.status === 409)
        throw new HttpException(
          'HighLevel reported a conflict. Refresh the record and check for duplicates or an occupied time slot.',
          409,
        );
      throw new BadGatewayException(
        'HighLevel could not complete this request. Refresh before retrying a change.',
      );
    }
    if (response.status === 204) return { success: true };
    let raw: string;
    try {
      raw = await response.text();
    } catch {
      throw new BadGatewayException(
        'HighLevel did not confirm this response. Refresh before retrying a change; it may have been saved.',
      );
    }
    if (!raw) return { success: true };
    try {
      const parsed: unknown = JSON.parse(
        raw.split(creds.token).join('[redacted]'),
      );
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error();
      return parsed as Record<string, unknown>;
    } catch {
      throw new BadGatewayException(
        'HighLevel returned an unreadable response. Refresh before retrying a change.',
      );
    }
  }
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
    if (this.calendarToken && this.locationId && this.calendarId) {
      this.logger.log(
        `GHL platform calendar env present calendarId=${this.calendarId} slotMinutes=${GHL_SLOT_MINUTES} (tools use org connections)`,
      );
    }
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey && this.locationId);
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
      this.logger.warn(
        'GhlService.upsertLead rejected: email or phone required',
      );
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

    const tagResult = await this.request(
      'POST',
      `/contacts/${contactId}/tags`,
      {
        tags,
      },
    );
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
   * Uses org creds when provided; otherwise GHL_API_KEY (contacts scope).
   */
  async upsertContact(
    input: GhlContactInput,
    creds?: GhlContactCreds,
  ): Promise<GhlUpsertLeadResult> {
    const locationId = creds?.locationId?.trim() || this.locationId;
    const token = creds?.token?.trim() || this.apiKey;
    if (!token || !locationId) {
      return {
        ok: false,
        skipped: true,
        error: 'contact_upsert_unavailable',
        message:
          'GoHighLevel contact credentials are missing on this connection.',
      };
    }

    const firstName = input.firstName?.trim() ?? '';
    const lastName = input.lastName?.trim() ?? '';
    const email = usableContactEmail(input.email);
    const phone = input.phone?.trim() ?? '';
    const companyName = input.company?.trim() ?? '';

    if (!email && !phone) {
      this.logger.warn(
        'GhlService.upsertContact rejected: email or phone required',
      );
      return {
        ok: false,
        error: 'email or phone is required',
        message: 'Need an email or phone to create a GoHighLevel contact.',
      };
    }

    const body: GhlJson = {
      locationId,
      source: 'Speeko Voice Agent',
    };
    if (firstName) body.firstName = firstName;
    if (lastName) body.lastName = lastName;
    if (email) body.email = email;
    if (phone) body.phone = phone;
    if (companyName) body.companyName = companyName;

    const upsert = await this.request(
      'POST',
      '/contacts/upsert',
      body,
      'contacts',
      token,
    );
    if (upsert.networkError) {
      this.logger.warn(
        `GHL contact upsert network error: ${upsert.networkError}`,
      );
      return {
        ok: false,
        error: upsert.networkError,
        message: upsert.networkError,
      };
    }
    if (!upsert.ok) {
      this.logger.warn(
        `GHL contact upsert failed: status=${upsert.status} body=${truncate(upsert.text)}`,
      );
      return {
        ok: false,
        error: `ghl upsert ${upsert.status}`,
        message: upsertContactErrorMessage(upsert.status),
      };
    }

    const contactId = readContactId(upsert.json);
    if (!contactId) {
      this.logger.warn(
        'GHL contact upsert succeeded but contact.id was missing',
      );
      return { ok: false, error: 'ghl upsert missing contact.id' };
    }

    const created = upsert.json?.new === true;
    const notes = input.notes?.trim() ?? '';
    if (notes) {
      const noteResult = await this.request(
        'POST',
        `/contacts/${contactId}/notes`,
        { body: notes },
        'contacts',
        token,
      );
      if (!noteResult.ok) {
        this.logger.warn(
          `GHL add note failed for contact=${contactId} status=${noteResult.status} body=${truncate(noteResult.text)}`,
        );
      }
    }

    this.logger.log(
      `GHL contact upserted contact=${contactId} created=${created} email=${email || 'n/a'}`,
    );
    return { ok: true, contactId, created };
  }

  /**
   * Look up an existing GHL contact by exact email and/or phone.
   * Uses PIT-friendly GET /contacts/search/duplicate (not OAuth-only /contacts/lookup).
   * A miss is ok:true found:false — not an HTTP error to the agent.
   */
  async lookupContact(
    input: GhlLookupContactInput,
    creds?: GhlContactCreds,
  ): Promise<GhlLookupContactResult> {
    const locationId = creds?.locationId?.trim() || this.locationId;
    const token = creds?.token?.trim() || this.apiKey;
    if (!token || !locationId) {
      return {
        ok: false,
        skipped: true,
        error: 'contact_lookup_unavailable',
        message:
          'GoHighLevel contact credentials are missing on this connection.',
      };
    }

    const email = input.email?.trim().toLowerCase() ?? '';
    const phone = input.phone?.trim() ?? '';
    if (!email && !phone) {
      this.logger.warn(
        'GhlService.lookupContact rejected: email or phone required',
      );
      return {
        ok: false,
        error: 'email or phone is required',
        message: 'Need an email or phone to look up a GoHighLevel contact.',
      };
    }

    const params = new URLSearchParams({ locationId });
    if (email) params.set('email', email);
    if (phone) params.set('number', phone);
    const path = `/contacts/search/duplicate?${params.toString()}`;
    const res = await this.request('GET', path, undefined, 'contacts', token);
    if (res.networkError) {
      this.logger.warn(`GHL contact lookup network error: ${res.networkError}`);
      return {
        ok: false,
        error: res.networkError,
        message: res.networkError,
      };
    }
    if (!res.ok) {
      if (isContactNotFoundStatus(res.status, res.json, res.text)) {
        return { ok: true, found: false };
      }
      this.logger.warn(
        `GHL contact lookup failed: status=${res.status} body=${truncate(res.text)}`,
      );
      return {
        ok: false,
        error: `ghl lookup ${res.status}`,
        message: lookupContactErrorMessage(res.status),
      };
    }

    const found = readLookupContact(res.json);
    if (!found) {
      return { ok: true, found: false };
    }
    this.logger.log(
      `GHL contact lookup hit contact=${found.contactId} email=${email || 'n/a'}`,
    );
    return { ok: true, found: true, ...found };
  }

  /**
   * Open slots only (GHL free-slots). Never lists existing events.
   * Uses org creds when provided; otherwise platform env.
   * startMs/endMs are unix milliseconds.
   */
  async getFreeSlots(
    input: {
      startMs: number;
      endMs: number;
      timezone?: string;
    },
    creds?: GhlCalendarCreds,
  ): Promise<GhlGetFreeSlotsResult> {
    const calendar = this.resolveCalendarCreds(creds);
    if (!calendar) {
      if (!this.calendarDisabledLogged) {
        this.logger.warn(
          'GhlService.getFreeSlots skipped: no org GHL creds and platform calendar env is unset',
        );
        this.calendarDisabledLogged = true;
      }
      return {
        ok: false,
        skipped: true,
        error: 'ghl_calendar_disabled',
        message:
          'GHL calendar is not configured. Link a GoHighLevel calendar on the agent.',
      };
    }

    const params = new URLSearchParams({
      startDate: String(input.startMs),
      endDate: String(input.endMs),
    });
    if (input.timezone?.trim()) {
      params.set('timezone', input.timezone.trim());
    }
    const path = `/calendars/${calendar.calendarId}/free-slots?${params.toString()}`;
    const res = await this.request(
      'GET',
      path,
      undefined,
      'calendar',
      calendar.token,
    );
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
      `GHL free-slots calendarId=${calendar.calendarId} slots=${slots.length} ` +
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
   * Book an appointment. Uses org creds when provided; otherwise platform env.
   * Does not set ignoreFreeSlotValidation — occupied slots stay rejected.
   */
  async createAppointment(
    input: GhlCreateAppointmentInput,
    creds?: GhlCalendarCreds,
  ): Promise<GhlCreateAppointmentResult> {
    const calendar = this.resolveCalendarCreds(creds);
    if (!calendar) {
      return {
        ok: false,
        skipped: true,
        error: 'ghl_calendar_disabled',
        message:
          'GHL calendar is not configured. Link a GoHighLevel calendar on the agent.',
      };
    }

    const body: GhlJson = {
      calendarId: calendar.calendarId,
      locationId: calendar.locationId,
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
      calendar.token,
    );
    if (res.networkError) {
      this.logger.warn(
        `GHL create appointment network error: ${res.networkError}`,
      );
      return { ok: false, error: 'network_error', message: res.networkError };
    }
    if (!res.ok) {
      this.logger.warn(
        `GHL create appointment failed: status=${res.status} body=${truncate(res.text)}`,
      );
      return { ok: false, ...appointmentErrorFromHttp(res) };
    }

    const appointmentId = readAppointmentId(res.json);
    if (!appointmentId) {
      this.logger.warn('GHL create appointment succeeded but id was missing');
      return { ok: false, error: 'ghl_appointment_missing_id' };
    }

    const startTime = readString(res.json, 'startTime') ?? input.startTime;
    const endTime = readString(res.json, 'endTime') ?? input.endTime;
    const title = readString(res.json, 'title') ?? input.title;
    this.logger.log(
      `GHL appointment created id=${appointmentId} start=${startTime}`,
    );
    return { ok: true, appointmentId, startTime, endTime, title };
  }

  /**
   * List calendars for a location (connection test). Always uses the given PIT.
   */
  async listCalendars(creds: {
    token: string;
    locationId: string;
  }): Promise<GhlListCalendarsResult> {
    const token = creds.token.trim();
    const locationId = creds.locationId.trim();
    if (!token || !locationId) {
      return {
        ok: false,
        error: 'missing_creds',
        message: 'GoHighLevel token and location id are required.',
      };
    }

    const path = `/calendars/?locationId=${encodeURIComponent(locationId)}`;
    const res = await this.request('GET', path, undefined, 'calendar', token);
    if (res.networkError) {
      this.logger.warn(`GHL list calendars network error: ${res.networkError}`);
      return { ok: false, error: 'network_error', message: res.networkError };
    }
    if (!res.ok) {
      this.logger.warn(
        `GHL list calendars failed: status=${res.status} body=${truncate(res.text)}`,
      );
      return {
        ok: false,
        error: `ghl_calendars_${res.status}`,
        message: listCalendarsErrorMessage(res.status),
      };
    }

    const calendars = readCalendars(res.json);
    this.logger.log(
      `GHL list calendars location=${locationId} count=${calendars.length}`,
    );
    return { ok: true, calendars };
  }

  /**
   * List (and optionally search) contacts for a location with the given PIT.
   * Cursor pagination via GHL `startAfterId` + `startAfter`, encoded into one
   * opaque `nextCursor`. Never throws; never logs the token or contact data.
   * Needs the contacts.readonly scope.
   */
  async listContacts(
    input: GhlListContactsInput,
  ): Promise<GhlListContactsResult> {
    const token = input.token.trim();
    const locationId = input.locationId.trim();
    if (!token || !locationId) {
      return {
        ok: false,
        error: 'missing_creds',
        message: 'GoHighLevel token and location id are required.',
      };
    }

    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 25), 1), 100);
    const params = new URLSearchParams({
      locationId,
      limit: String(limit),
    });
    const query = input.query?.trim();
    if (query) params.set('query', query.slice(0, 120));
    const cursor = decodeContactCursor(input.cursor);
    if (cursor) {
      params.set('startAfterId', cursor.startAfterId);
      if (cursor.startAfter) params.set('startAfter', cursor.startAfter);
    }

    const res = await this.request(
      'GET',
      `/contacts/?${params.toString()}`,
      undefined,
      'contacts',
      token,
    );
    if (res.networkError) {
      this.logger.warn('GHL list contacts network error');
      return {
        ok: false,
        error: 'network_error',
        message: 'HighLevel is unavailable. Please try refreshing.',
      };
    }
    if (!res.ok) {
      this.logger.warn(`GHL list contacts failed: status=${res.status}`);
      return {
        ok: false,
        error: `ghl_contacts_${res.status}`,
        message: listContactsErrorMessage(res.status),
      };
    }

    const contacts = readContacts(res.json);
    const meta = readMeta(res.json);
    const nextCursor =
      contacts.length >= limit && meta.startAfterId
        ? encodeContactCursor(meta.startAfterId, meta.startAfter)
        : null;
    this.logger.log(
      `GHL list contacts location=${locationId} count=${contacts.length}`,
    );
    return { ok: true, contacts, nextCursor, total: meta.total };
  }

  private resolveCalendarCreds(
    creds?: GhlCalendarCreds,
  ): GhlCalendarCreds | null {
    const token = creds?.token?.trim() || this.calendarToken;
    const locationId = creds?.locationId?.trim() || this.locationId;
    const calendarId = creds?.calendarId?.trim() || this.calendarId;
    if (!token || !locationId || !calendarId) return null;
    return { token, locationId, calendarId };
  }

  private async request(
    method: string,
    path: string,
    body?: GhlJson,
    tokenKind: GhlTokenKind = 'contacts',
    tokenOverride?: string,
  ): Promise<GhlHttpResult> {
    const token =
      tokenOverride?.trim() ||
      (tokenKind === 'calendar' ? this.calendarToken : this.apiKey);
    try {
      const response = await fetch(`${GHL_API_BASE}${path}`, {
        method,
        signal: AbortSignal.timeout(20_000),
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

function upsertContactErrorMessage(status: number): string {
  if (status === 401) {
    return 'Unauthorized. Check the v3 Private Integration Token and that it includes contacts.write.';
  }
  if (status === 403) {
    return 'Forbidden. Use a sub-account token with contacts.write for this location.';
  }
  if (status === 400) {
    return 'Bad request. Check the location (sub-account) id and contact fields.';
  }
  if (status === 422) {
    return 'GoHighLevel rejected the contact fields (often an invalid email). Use a real email or the call phone only.';
  }
  return 'Could not create or update the GoHighLevel contact. Check that the Private Integration Token includes contacts.write.';
}

/** GHL 422s on values like "Unknown". Phone-only upsert is fine. */
function usableContactEmail(value?: string): string {
  const email = value?.trim().toLowerCase() ?? '';
  if (!email) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  const local = email.slice(0, email.indexOf('@'));
  if (
    /^(unknown|n\/a|na|none|null|undefined|test|user|email|caller)$/i.test(
      local,
    )
  ) {
    return '';
  }
  return email;
}

function lookupContactErrorMessage(status: number): string {
  if (status === 401) {
    return 'Unauthorized. Check the v3 Private Integration Token and that it includes contacts.readonly.';
  }
  if (status === 403) {
    return 'Forbidden. Use a sub-account token with contacts.readonly for this location.';
  }
  if (status === 400) {
    return 'Bad request. Check the location (sub-account) id and the email or phone.';
  }
  return 'Could not look up the GoHighLevel contact. Check that the Private Integration Token includes contacts.readonly.';
}

function ghlErrorBlob(json: GhlJson | null, text: string): string {
  const message = json && typeof json.message === 'string' ? json.message : '';
  return `${message} ${text}`.trim();
}

function isContactNotFoundMessage(raw: string): boolean {
  return (
    /contact.*not found/i.test(raw) || /error in contact service/i.test(raw)
  );
}

function isContactNotFoundStatus(
  status: number,
  json: GhlJson | null,
  text: string,
): boolean {
  if (status === 404) return true;
  if (status !== 400) return false;
  return isContactNotFoundMessage(ghlErrorBlob(json, text));
}

function appointmentErrorFromHttp(res: GhlHttpResult): {
  error: string;
  message: string;
} {
  const raw = ghlErrorBlob(res.json, res.text);
  if (isContactNotFoundMessage(raw)) {
    return {
      error: 'missing_contact',
      message:
        'GoHighLevel has no contact with that id. Call lookupGhlContact with email or phone, or upsertGhlContact if none exists. Do not invent a contact id. Do not claim the meeting is booked.',
    };
  }
  if (res.status === 400) {
    return {
      error: 'slot_unavailable',
      message:
        'That time is no longer open. Check free slots again and pick another time.',
    };
  }
  return {
    error: `ghl_appointment_${res.status}`,
    message: 'Could not book the meeting on the calendar.',
  };
}

function readLookupContact(json: GhlJson | null):
  | {
      contactId: string;
      email?: string;
      phone?: string;
      name?: string;
    }
  | undefined {
  if (!json) return undefined;
  let contact: GhlJson | null = null;
  const nested = json.contact;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    contact = nested as GhlJson;
  } else if (Array.isArray(json.contacts) && json.contacts[0]) {
    const first = json.contacts[0];
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      contact = first as GhlJson;
    }
  } else if (typeof json.id === 'string' && json.id.trim()) {
    contact = json;
  }
  if (!contact) return undefined;
  const contactId = typeof contact.id === 'string' ? contact.id.trim() : '';
  if (!contactId) return undefined;
  const email =
    typeof contact.email === 'string' && contact.email.trim()
      ? contact.email.trim()
      : undefined;
  const phone =
    typeof contact.phone === 'string' && contact.phone.trim()
      ? contact.phone.trim()
      : undefined;
  const first =
    typeof contact.firstName === 'string' ? contact.firstName.trim() : '';
  const last =
    typeof contact.lastName === 'string' ? contact.lastName.trim() : '';
  const full =
    typeof contact.name === 'string' && contact.name.trim()
      ? contact.name.trim()
      : [first, last].filter(Boolean).join(' ') || undefined;
  return { contactId, email, phone, name: full };
}

function listContactsErrorMessage(status: number): string {
  if (status === 401) {
    return 'Unauthorized. Check the v3 Private Integration Token and that it includes contacts.readonly.';
  }
  if (status === 403) {
    return 'Forbidden. Use a sub-account token with contacts.readonly for this location.';
  }
  if (status === 400 || status === 422) {
    return 'Bad request. Check the location (sub-account) id.';
  }
  return 'Could not load GoHighLevel contacts. Check the Private Integration Token and location id.';
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readContacts(json: GhlJson | null): GhlContactSummary[] {
  const raw = json?.contacts;
  if (!Array.isArray(raw)) return [];
  const out: GhlContactSummary[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const c = item as Record<string, unknown>;
    const id = str(c.id);
    if (!id) continue;
    const firstName = str(c.firstName);
    const lastName = str(c.lastName);
    const name =
      str(c.contactName) ||
      str(c.name) ||
      [firstName, lastName].filter(Boolean).join(' ');
    out.push({
      id,
      name,
      firstName,
      lastName,
      email: str(c.email) || null,
      phone: str(c.phone) || null,
      company: str(c.companyName) || null,
      dnd: c.dnd === true,
    });
  }
  return out;
}

function readMeta(json: GhlJson | null): {
  startAfterId: string;
  startAfter: string;
  total: number | null;
} {
  const meta = json?.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return { startAfterId: '', startAfter: '', total: null };
  }
  const m = meta as Record<string, unknown>;
  const startAfter =
    typeof m.startAfter === 'number' || typeof m.startAfter === 'string'
      ? String(m.startAfter)
      : '';
  const total = typeof m.total === 'number' ? m.total : null;
  return { startAfterId: str(m.startAfterId), startAfter, total };
}

function encodeContactCursor(startAfterId: string, startAfter: string): string {
  return Buffer.from(
    JSON.stringify({ i: startAfterId, a: startAfter }),
  ).toString('base64url');
}

function decodeContactCursor(
  raw?: string,
): { startAfterId: string; startAfter: string } | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as { i?: unknown; a?: unknown };
    const startAfterId = str(p.i);
    if (!startAfterId) return null;
    return { startAfterId, startAfter: str(p.a) };
  } catch {
    return null;
  }
}

function listCalendarsErrorMessage(status: number): string {
  if (status === 401) {
    return 'Unauthorized. Check the v3 Private Integration Token and that it includes calendars.readonly.';
  }
  if (status === 403) {
    return 'Forbidden. Use a sub-account token with calendars.readonly for this location.';
  }
  if (status === 400) {
    return 'Bad request. Check the location (sub-account) id.';
  }
  return 'Could not list calendars. Check the Private Integration Token and location id.';
}

function readCalendars(json: GhlJson | null): { id: string; name?: string }[] {
  if (!json) return [];
  const raw = json.calendars ?? json.data;
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(json)
      ? (json as unknown as unknown[])
      : [];
  const out: { id: string; name?: string }[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = (item as { id?: unknown }).id;
    if (typeof id !== 'string' || !id.trim()) continue;
    const name = (item as { name?: unknown }).name;
    out.push({
      id: id.trim(),
      name: typeof name === 'string' && name.trim() ? name.trim() : undefined,
    });
  }
  return out;
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

function readString(json: GhlJson | null, key: string): string | undefined {
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
