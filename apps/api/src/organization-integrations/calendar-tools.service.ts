import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { OrganizationAgentsService } from '../agents/organization-agents.service';
import { CallsRepository } from '../calls/calls.repository';
import {
  CalendarCancelEventDto,
  CalendarCreateEventDto,
  CalendarFreeBusyDto,
  CalendarListEventsDto,
  CalendarToolResponseDto,
} from './dto/calendar-tool.dto';
import { IntegrationProvider } from './organization-integration.entity';
import { OrganizationIntegrationsService } from './organization-integrations.service';
import { NylasService } from './nylas.service';

/**
 * Resolves call → org agent → calendar integration, then runs Nylas ops.
 * Used by worker-secret internal calendar routes.
 */
@Injectable()
export class CalendarToolsService {
  private readonly logger = new Logger(CalendarToolsService.name);

  constructor(
    private readonly callsRepository: CallsRepository,
    @Inject(forwardRef(() => OrganizationAgentsService))
    private readonly organizationAgentsService: OrganizationAgentsService,
    private readonly organizationIntegrationsService: OrganizationIntegrationsService,
    private readonly nylas: NylasService,
  ) {}

  async freeBusy(
    callId: string,
    dto: CalendarFreeBusyDto,
  ): Promise<CalendarToolResponseDto> {
    const resolved = await this.resolveIntegration(callId);
    if (!resolved.ok) {
      this.logCalendarOutcome(callId, 'free-busy', resolved);
      return resolved;
    }

    const start = parseTimeToUnix(dto.startTime);
    const end = parseTimeToUnix(dto.endTime);
    if (start == null || end == null) {
      const res = {
        ok: false as const,
        error: 'invalid_time',
        message:
          'startTime and endTime must be unix seconds or ISO-8601 date-time strings.',
      };
      this.logCalendarOutcome(callId, 'free-busy', res, dto.startTime, dto.endTime);
      return res;
    }
    if (end <= start) {
      const res = {
        ok: false as const,
        error: 'invalid_range',
        message: 'endTime must be after startTime.',
      };
      this.logCalendarOutcome(callId, 'free-busy', res, unixToIso(start), unixToIso(end));
      return res;
    }

    const past = pastWindowError(start, end);
    if (past) {
      this.logCalendarOutcome(callId, 'free-busy', past, unixToIso(start), unixToIso(end));
      return past;
    }

    const email =
      dto.email?.trim() ||
      resolved.integration.email?.trim() ||
      null;
    if (!email) {
      const res = {
        ok: false as const,
        error: 'missing_email',
        message:
          'No email on the calendar integration. Set email on the Nylas connection (grant mailbox) so free/busy can run.',
      };
      this.logCalendarOutcome(callId, 'free-busy', res, unixToIso(start), unixToIso(end));
      return res;
    }

    const result = await this.nylas.freeBusy(resolved.creds, {
      startTime: start,
      endTime: end,
      emails: [email],
    });

    if (!result.ok) {
      const res = {
        ok: false as const,
        error: 'nylas_error',
        message: result.message,
      };
      this.logCalendarOutcome(callId, 'free-busy', res, unixToIso(start), unixToIso(end));
      return res;
    }

    const row = result.data[0];
    if (row?.error) {
      const res = {
        ok: false as const,
        error: 'free_busy_error',
        message: row.error,
      };
      this.logCalendarOutcome(callId, 'free-busy', res, unixToIso(start), unixToIso(end));
      return res;
    }

    const busy = (row?.timeSlots ?? []).map((s) => ({
      startTime: s.startTime,
      endTime: s.endTime,
      startIso: unixToIso(s.startTime),
      endIso: unixToIso(s.endTime),
      status: s.status ?? 'busy',
    }));

    const message =
      busy.length === 0
        ? `No busy blocks for ${email} between ${unixToIso(start)} and ${unixToIso(end)}. The calendar appears free in this window.`
        : `Found ${busy.length} busy block(s) for ${email}. Use these to avoid double-booking; free times are gaps outside these blocks.`;

    const res = {
      ok: true as const,
      message,
      data: {
        email,
        window: {
          startTime: start,
          endTime: end,
          startIso: unixToIso(start),
          endIso: unixToIso(end),
        },
        busySlots: busy,
      },
    };
    this.logCalendarOutcome(
      callId,
      'free-busy',
      res,
      unixToIso(start),
      unixToIso(end),
      busy.length,
    );
    return res;
  }

  async listEvents(
    callId: string,
    dto: CalendarListEventsDto,
  ): Promise<CalendarToolResponseDto> {
    const resolved = await this.resolveIntegration(callId);
    if (!resolved.ok) return resolved;

    const start = dto.startTime ? parseTimeToUnix(dto.startTime) : undefined;
    const end = dto.endTime ? parseTimeToUnix(dto.endTime) : undefined;
    if (dto.startTime && start == null) {
      return {
        ok: false,
        error: 'invalid_time',
        message: 'startTime must be unix seconds or ISO-8601.',
      };
    }
    if (dto.endTime && end == null) {
      return {
        ok: false,
        error: 'invalid_time',
        message: 'endTime must be unix seconds or ISO-8601.',
      };
    }

    const limit = dto.limit ?? 10;
    const result = await this.nylas.listEvents(resolved.creds, {
      start: start ?? undefined,
      end: end ?? undefined,
      limit,
    });

    if (!result.ok) {
      return { ok: false, error: 'nylas_error', message: result.message };
    }

    const events = result.data.map((e) => ({
      eventId: e.id,
      title: e.title,
      startTime: e.startTime,
      endTime: e.endTime,
      startIso: e.startTime != null ? unixToIso(e.startTime) : null,
      endIso: e.endTime != null ? unixToIso(e.endTime) : null,
      location: e.location,
      status: e.status,
    }));

    return {
      ok: true,
      message:
        events.length === 0
          ? 'No events found in the requested range.'
          : `Found ${events.length} event(s). Refer to eventId when cancelling.`,
      data: { events, count: events.length },
    };
  }

  async createEvent(
    callId: string,
    dto: CalendarCreateEventDto,
  ): Promise<CalendarToolResponseDto> {
    const resolved = await this.resolveIntegration(callId);
    if (!resolved.ok) {
      this.logCalendarOutcome(callId, 'create-event', resolved);
      return resolved;
    }

    const start = parseTimeToUnix(dto.startTime);
    const end = parseTimeToUnix(dto.endTime);
    if (start == null || end == null) {
      const res = {
        ok: false as const,
        error: 'invalid_time',
        message:
          'startTime and endTime must be unix seconds or ISO-8601 date-time strings.',
      };
      this.logCalendarOutcome(callId, 'create-event', res);
      return res;
    }
    if (end <= start) {
      const res = {
        ok: false as const,
        error: 'invalid_range',
        message: 'endTime must be after startTime.',
      };
      this.logCalendarOutcome(callId, 'create-event', res, unixToIso(start), unixToIso(end));
      return res;
    }

    const past = pastWindowError(start, end);
    if (past) {
      this.logCalendarOutcome(callId, 'create-event', past, unixToIso(start), unixToIso(end));
      return past;
    }

    const participants =
      dto.participantEmail?.trim()
        ? [
            {
              email: dto.participantEmail.trim(),
              name: dto.participantName?.trim() || undefined,
            },
          ]
        : undefined;

    const result = await this.nylas.createEvent(resolved.creds, {
      title: dto.title.trim(),
      startTime: start,
      endTime: end,
      timezone: dto.timezone,
      description: dto.description,
      location: dto.location,
      participants,
    });

    if (!result.ok) {
      const res = {
        ok: false as const,
        error: 'nylas_error',
        message: result.message,
      };
      this.logCalendarOutcome(callId, 'create-event', res, unixToIso(start), unixToIso(end));
      return res;
    }

    const e = result.data;
    const res = {
      ok: true as const,
      message: `Event created: "${e.title ?? dto.title}" from ${unixToIso(start)} to ${unixToIso(end)}. eventId=${e.id}`,
      data: {
        eventId: e.id,
        title: e.title ?? dto.title,
        startTime: start,
        endTime: end,
        startIso: unixToIso(start),
        endIso: unixToIso(end),
        location: e.location ?? dto.location ?? null,
      },
    };
    this.logCalendarOutcome(callId, 'create-event', res, unixToIso(start), unixToIso(end));
    return res;
  }

  async cancelEvent(
    callId: string,
    dto: CalendarCancelEventDto,
  ): Promise<CalendarToolResponseDto> {
    const resolved = await this.resolveIntegration(callId);
    if (!resolved.ok) return resolved;

    const eventId = dto.eventId.trim();
    if (!eventId) {
      return {
        ok: false,
        error: 'missing_event_id',
        message: 'eventId is required (from createCalendarEvent or listCalendarEvents).',
      };
    }

    const result = await this.nylas.deleteEvent(resolved.creds, eventId);
    if (!result.ok) {
      return { ok: false, error: 'nylas_error', message: result.message };
    }

    return {
      ok: true,
      message: `Event ${eventId} was cancelled/deleted on the calendar.`,
      data: { eventId, deleted: true },
    };
  }

  private async resolveIntegration(
    callId: string,
  ): Promise<CalendarResolveResult> {
    const call = await this.callsRepository.findById(callId);
    if (!call) {
      return {
        ok: false,
        error: 'call_not_found',
        message: 'Call not found for calendar tool request.',
      };
    }

    if (!call.organizationId || !call.organizationAgentId) {
      return {
        ok: false,
        error: 'no_org_agent',
        message:
          'This call has no organization agent. Calendar tools require an org agent with a linked Nylas calendar integration. Platform template web tests cannot use org calendars.',
      };
    }

    let orgAgent;
    try {
      orgAgent = await this.organizationAgentsService.getEntityWithTemplate(
        call.organizationId,
        call.organizationAgentId,
      );
    } catch {
      return {
        ok: false,
        error: 'agent_not_found',
        message: 'Organization agent for this call was not found.',
      };
    }

    if (!orgAgent.calendarIntegrationId) {
      return {
        ok: false,
        error: 'calendar_not_linked',
        message:
          'No calendar integration is linked to this agent. In the portal, open the agent and select a Nylas calendar connection under Calendar integration.',
      };
    }

    let integration;
    try {
      integration =
        await this.organizationIntegrationsService.getEntityForOrg(
          call.organizationId,
          orgAgent.calendarIntegrationId,
        );
    } catch {
      return {
        ok: false,
        error: 'integration_not_found',
        message:
          'The linked calendar integration was not found. Re-link a valid Nylas connection on the agent.',
      };
    }

    if (!integration.isActive) {
      return {
        ok: false,
        error: 'integration_inactive',
        message: 'The linked calendar integration is inactive.',
      };
    }

    if (integration.provider !== IntegrationProvider.NYLAS) {
      return {
        ok: false,
        error: 'unsupported_provider',
        message: `Provider ${integration.provider} is not supported for calendar tools.`,
      };
    }

    this.logger.log(
      `calendar resolve callId=${callId} integration=${integration.id} grant=${integration.grantId} ` +
        `email=${integration.email ? 'set' : 'empty'} calendarId=${integration.calendarId || 'primary'}`,
    );

    return {
      ok: true,
      integration,
      creds: {
        apiKey: integration.apiKey,
        grantId: integration.grantId,
        calendarId: integration.calendarId || 'primary',
        apiUri: integration.apiUri,
        email: integration.email,
      },
    };
  }

  private logCalendarOutcome(
    callId: string,
    op: string,
    res: { ok: boolean; error?: string; message?: string },
    startIso?: string,
    endIso?: string,
    busyCount?: number,
  ): void {
    const window =
      startIso || endIso
        ? ` start=${startIso ?? '-'} end=${endIso ?? '-'}`
        : '';
    const busy =
      busyCount != null ? ` busySlots=${busyCount}` : '';
    if (res.ok) {
      this.logger.log(
        `calendar ${op} callId=${callId} ok=true${window}${busy} msg=${(res.message ?? '').slice(0, 160)}`,
      );
    } else {
      this.logger.warn(
        `calendar ${op} callId=${callId} ok=false error=${res.error ?? 'unknown'}${window} msg=${(res.message ?? '').slice(0, 200)}`,
      );
    }
  }
}

/** Reject windows that ended more than 24h ago (catches wrong-year LLM tool args). */
function pastWindowError(
  start: number,
  end: number,
): { ok: false; error: string; message: string } | null {
  const nowSec = Math.floor(Date.now() / 1000);
  const grace = 24 * 60 * 60;
  if (end >= nowSec - grace) {
    return null;
  }
  return {
    ok: false,
    error: 'window_in_past',
    message:
      `The requested window ends in the past (start=${unixToIso(start)}, end=${unixToIso(end)}). ` +
      `Current UTC time is ${new Date().toISOString()}. ` +
      `Re-resolve “today/tomorrow” from the authoritative call clock and call again with correct year/month/day. Do not invent free times.`,
  };
}

type CalendarResolveResult =
  | {
      ok: true;
      integration: Awaited<
        ReturnType<OrganizationIntegrationsService['getEntityForOrg']>
      >;
      creds: {
        apiKey: string;
        grantId: string;
        calendarId: string;
        apiUri: string;
        email: string | null;
      };
    }
  | { ok: false; error: string; message: string };

/** Accept unix seconds (number or numeric string) or ISO-8601. */
export function parseTimeToUnix(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{9,12}$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

function unixToIso(unix: number): string {
  return new Date(unix * 1000).toISOString();
}
