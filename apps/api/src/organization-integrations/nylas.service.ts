import { Injectable, Logger } from '@nestjs/common';

export type NylasCredentials = {
  apiKey: string;
  grantId: string;
  calendarId: string;
  apiUri: string;
  email?: string | null;
};

export type NylasFreeBusySlot = {
  startTime: number;
  endTime: number;
  status?: string;
};

export type NylasEventSummary = {
  id: string;
  title: string | null;
  startTime: number | null;
  endTime: number | null;
  startTimezone?: string | null;
  endTimezone?: string | null;
  location?: string | null;
  status?: string | null;
  participants?: Array<{ email?: string; name?: string; status?: string }>;
};

export type NylasResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

/**
 * Thin Nylas Calendar v3 HTTP adapter.
 * Credentials come from organization_integrations — never log apiKey.
 */
@Injectable()
export class NylasService {
  private readonly logger = new Logger(NylasService.name);

  async listCalendars(
    creds: NylasCredentials,
  ): Promise<NylasResult<{ id: string; name?: string }[]>> {
    const url = `${this.base(creds)}/v3/grants/${encodeURIComponent(creds.grantId)}/calendars`;
    return this.request(url, { method: 'GET', apiKey: creds.apiKey }, (json) => {
      const data = Array.isArray(json?.data) ? json.data : [];
      return data.map((c: Record<string, unknown>) => ({
        id: String(c.id ?? ''),
        name: typeof c.name === 'string' ? c.name : undefined,
      }));
    });
  }

  async freeBusy(
    creds: NylasCredentials,
    params: { startTime: number; endTime: number; emails: string[] },
  ): Promise<
    NylasResult<
      Array<{
        email: string;
        timeSlots: NylasFreeBusySlot[];
        error?: string;
      }>
    >
  > {
    const url = `${this.base(creds)}/v3/grants/${encodeURIComponent(creds.grantId)}/calendars/free-busy`;
    return this.request(
      url,
      {
        method: 'POST',
        apiKey: creds.apiKey,
        body: {
          start_time: params.startTime,
          end_time: params.endTime,
          emails: params.emails,
        },
      },
      (json) => {
        const data = Array.isArray(json?.data) ? json.data : [];
        return data.map((row: Record<string, unknown>) => {
          const slotsRaw = Array.isArray(row.time_slots) ? row.time_slots : [];
          const timeSlots: NylasFreeBusySlot[] = slotsRaw.map(
            (s: Record<string, unknown>) => ({
              startTime: Number(s.start_time),
              endTime: Number(s.end_time),
              status: typeof s.status === 'string' ? s.status : undefined,
            }),
          );
          return {
            email: String(row.email ?? ''),
            timeSlots,
            error: typeof row.error === 'string' ? row.error : undefined,
          };
        });
      },
    );
  }

  async listEvents(
    creds: NylasCredentials,
    params: { start?: number; end?: number; limit?: number },
  ): Promise<NylasResult<NylasEventSummary[]>> {
    const q = new URLSearchParams();
    q.set('calendar_id', creds.calendarId || 'primary');
    if (params.start != null) q.set('start', String(params.start));
    if (params.end != null) q.set('end', String(params.end));
    q.set('limit', String(params.limit ?? 10));
    const url = `${this.base(creds)}/v3/grants/${encodeURIComponent(creds.grantId)}/events?${q}`;
    return this.request(url, { method: 'GET', apiKey: creds.apiKey }, (json) => {
      const data = Array.isArray(json?.data) ? json.data : [];
      return data.map((e: Record<string, unknown>) => this.mapEvent(e));
    });
  }

  async createEvent(
    creds: NylasCredentials,
    params: {
      title: string;
      startTime: number;
      endTime: number;
      timezone?: string;
      description?: string;
      location?: string;
      participants?: Array<{ email: string; name?: string }>;
    },
  ): Promise<NylasResult<NylasEventSummary>> {
    const q = new URLSearchParams();
    q.set('calendar_id', creds.calendarId || 'primary');
    const url = `${this.base(creds)}/v3/grants/${encodeURIComponent(creds.grantId)}/events?${q}`;
    const tz = params.timezone?.trim() || 'UTC';
    const body: Record<string, unknown> = {
      title: params.title,
      busy: true,
      when: {
        start_time: params.startTime,
        end_time: params.endTime,
        start_timezone: tz,
        end_timezone: tz,
      },
    };
    if (params.description) body.description = params.description;
    if (params.location) body.location = params.location;
    if (params.participants?.length) {
      body.participants = params.participants.map((p) => ({
        email: p.email,
        name: p.name,
      }));
    }
    return this.request(
      url,
      { method: 'POST', apiKey: creds.apiKey, body },
      (json) => this.mapEvent((json?.data ?? json) as Record<string, unknown>),
    );
  }

  async deleteEvent(
    creds: NylasCredentials,
    eventId: string,
  ): Promise<NylasResult<{ deleted: true }>> {
    const q = new URLSearchParams();
    q.set('calendar_id', creds.calendarId || 'primary');
    const url = `${this.base(creds)}/v3/grants/${encodeURIComponent(creds.grantId)}/events/${encodeURIComponent(eventId)}?${q}`;
    return this.request(
      url,
      { method: 'DELETE', apiKey: creds.apiKey },
      () => ({ deleted: true as const }),
    );
  }

  private base(creds: NylasCredentials): string {
    return (creds.apiUri || 'https://api.us.nylas.com').replace(/\/$/, '');
  }

  private mapEvent(e: Record<string, unknown>): NylasEventSummary {
    const when =
      e.when && typeof e.when === 'object'
        ? (e.when as Record<string, unknown>)
        : {};
    const participants = Array.isArray(e.participants)
      ? e.participants.map((p: Record<string, unknown>) => ({
          email: typeof p.email === 'string' ? p.email : undefined,
          name: typeof p.name === 'string' ? p.name : undefined,
          status: typeof p.status === 'string' ? p.status : undefined,
        }))
      : undefined;
    return {
      id: String(e.id ?? ''),
      title: typeof e.title === 'string' ? e.title : null,
      startTime:
        typeof when.start_time === 'number'
          ? when.start_time
          : when.start_time != null
            ? Number(when.start_time)
            : null,
      endTime:
        typeof when.end_time === 'number'
          ? when.end_time
          : when.end_time != null
            ? Number(when.end_time)
            : null,
      startTimezone:
        typeof when.start_timezone === 'string' ? when.start_timezone : null,
      endTimezone:
        typeof when.end_timezone === 'string' ? when.end_timezone : null,
      location: typeof e.location === 'string' ? e.location : null,
      status: typeof e.status === 'string' ? e.status : null,
      participants,
    };
  }

  private async request<T>(
    url: string,
    opts: {
      method: string;
      apiKey: string;
      body?: Record<string, unknown>;
    },
    map: (json: any) => T,
  ): Promise<NylasResult<T>> {
    try {
      const res = await fetch(url, {
        method: opts.method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${opts.apiKey}`,
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const text = await res.text().catch(() => '');
      let json: any = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }
      if (!res.ok) {
        const message =
          (json && (json.message || json.error || json.type)) ||
          text.slice(0, 300) ||
          `Nylas HTTP ${res.status}`;
        this.logger.warn(
          `Nylas ${opts.method} failed status=${res.status} msg=${String(message).slice(0, 200)}`,
        );
        return {
          ok: false,
          status: res.status,
          message: String(message),
        };
      }
      // DELETE may return empty body
      if (!text && opts.method === 'DELETE') {
        return { ok: true, data: map({}) };
      }
      return { ok: true, data: map(json ?? {}) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Nylas request error: ${message}`);
      return { ok: false, status: 0, message };
    }
  }
}
