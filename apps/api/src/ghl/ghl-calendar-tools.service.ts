import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { OrganizationAgentsService } from '../agents/organization-agents.service';
import { CallsRepository } from '../calls/calls.repository';
import { IntegrationProvider } from '../organization-integrations/organization-integration.entity';
import { OrganizationIntegrationsService } from '../organization-integrations/organization-integrations.service';
import {
  GhlCalendarToolResponseDto,
  GhlFreeSlotsDto,
  GhlScheduleMeetingDto,
} from './dto/ghl-calendar-tool.dto';
import { GhlService } from './ghl.service';
import type { GhlCalendarCreds } from './ghl.types';
import {
  GHL_SLOT_MINUTES,
  addMinutesKeepingOffset,
  expandShortWindowToLocalDays,
  hasNumericUtcOffset,
  parseTimeToUnix,
  pastWindowError,
  unixToIso,
} from './ghl-time';

/**
 * Worker-facing GHL calendar ops: resolve call → org agent → GHL integration,
 * then GhlService. Secrets stay on the API (never in LiveKit metadata).
 */
@Injectable()
export class GhlCalendarToolsService {
  private readonly logger = new Logger(GhlCalendarToolsService.name);

  constructor(
    private readonly callsRepository: CallsRepository,
    @Inject(forwardRef(() => OrganizationAgentsService))
    private readonly organizationAgentsService: OrganizationAgentsService,
    private readonly organizationIntegrationsService: OrganizationIntegrationsService,
    private readonly ghl: GhlService,
  ) {}

  async freeSlots(
    callId: string,
    dto: GhlFreeSlotsDto,
  ): Promise<GhlCalendarToolResponseDto> {
    const resolved = await this.resolveGhl(callId);
    if (!resolved.ok) {
      return resolved;
    }
    const { creds } = resolved;

    const tz = dto.timezone?.trim() || undefined;
    const start = parseTimeToUnix(dto.startTime, tz);
    const end = parseTimeToUnix(dto.endTime, tz);
    if (start == null || end == null) {
      return {
        ok: false,
        error: 'invalid_time',
        message:
          'startTime and endTime must be unix seconds or ISO-8601 date-time strings.',
      };
    }
    if (end <= start) {
      return {
        ok: false,
        error: 'invalid_range',
        message: 'endTime must be after startTime.',
      };
    }
    const past = pastWindowError(start, end);
    if (past) return past;

    const window = expandShortWindowToLocalDays(start, end, tz);
    if (window.expanded) {
      this.logger.log(
        `ghl free-slots callId=${callId} expanded ${unixToIso(start)}..${unixToIso(end)} → ${unixToIso(window.startSec)}..${unixToIso(window.endSec)} tz=${tz ?? 'UTC'}`,
      );
    }

    const result = await this.ghl.getFreeSlots(
      {
        startMs: window.startSec * 1000,
        endMs: window.endSec * 1000,
        timezone: tz,
      },
      creds,
    );
    if (!result.ok) {
      this.logger.warn(
        `ghl free-slots callId=${callId} error=${result.error}`,
      );
      return {
        ok: false,
        error: result.error,
        message: result.message ?? 'Could not load open times.',
      };
    }

    const n = result.slots.length;
    const message =
      n === 0
        ? `No open ${result.slotMinutes}-minute slots between ${unixToIso(window.startSec)} and ${unixToIso(window.endSec)}. Offer another day or a callback.`
        : `${n} open ${result.slotMinutes}-minute slot(s). Speak only these times. Do not mention other appointments.`;

    this.logger.log(`ghl free-slots callId=${callId} ok=true slots=${n}`);
    return {
      ok: true,
      message,
      data: {
        timezone: result.timezone,
        slotMinutes: result.slotMinutes,
        slots: result.slots,
      },
    };
  }

  async scheduleMeeting(
    callId: string,
    dto: GhlScheduleMeetingDto,
  ): Promise<GhlCalendarToolResponseDto> {
    const resolved = await this.resolveGhl(callId);
    if (!resolved.ok) {
      return resolved;
    }
    const { call, creds } = resolved;

    const tz = dto.timezone?.trim() || undefined;
    const start = parseTimeToUnix(dto.startTime, tz);
    if (start == null) {
      return {
        ok: false,
        error: 'invalid_time',
        message: 'startTime must be unix seconds or ISO-8601.',
      };
    }
    const endRaw = dto.endTime
      ? parseTimeToUnix(dto.endTime, tz)
      : start + GHL_SLOT_MINUTES * 60;
    if (endRaw == null) {
      return {
        ok: false,
        error: 'invalid_time',
        message: 'endTime must be unix seconds or ISO-8601.',
      };
    }
    if (endRaw <= start) {
      return {
        ok: false,
        error: 'invalid_range',
        message: 'endTime must be after startTime.',
      };
    }
    const past = pastWindowError(start, endRaw);
    if (past) return past;

    const identity = resolveIdentity(dto, call.context);
    if (!identity.email && !identity.phone) {
      return {
        ok: false,
        error: 'missing_contact',
        message:
          'Need the caller email or phone to book. Ask once, then call this tool again.',
      };
    }

    const upsert = await this.ghl.upsertContact(identity, {
      token: creds.token,
      locationId: creds.locationId,
    });
    if (!upsert.ok) {
      this.logger.warn(
        `ghl schedule upsert callId=${callId} error=${upsert.error}`,
      );
      return {
        ok: false,
        error: upsert.error,
        message:
          upsert.error === 'contact_upsert_unavailable'
            ? 'Contact save is not configured on this GoHighLevel connection. Cannot book.'
            : 'Could not save the caller as a contact. Do not claim the meeting is booked.',
      };
    }

    const startTime = hasNumericUtcOffset(dto.startTime)
      ? dto.startTime.trim()
      : unixToIso(start);
    const endTime = dto.endTime
      ? hasNumericUtcOffset(dto.endTime)
        ? dto.endTime.trim()
        : unixToIso(endRaw)
      : addMinutesKeepingOffset(startTime, GHL_SLOT_MINUTES);

    const title =
      dto.title?.trim() ||
      (identity.name ? `Meeting — ${identity.name}` : 'Meeting');

    const booked = await this.ghl.createAppointment(
      {
        contactId: upsert.contactId,
        startTime,
        endTime,
        title,
        description: dto.description,
      },
      creds,
    );
    if (!booked.ok) {
      this.logger.warn(
        `ghl schedule book callId=${callId} error=${booked.error}`,
      );
      return {
        ok: false,
        error: booked.error,
        message: booked.message ?? 'Could not book the meeting.',
      };
    }

    this.logger.log(
      `ghl schedule callId=${callId} ok=true appointment=${booked.appointmentId}`,
    );
    return {
      ok: true,
      message: `Meeting booked from ${booked.startTime} to ${booked.endTime ?? endTime}.`,
      data: {
        appointmentId: booked.appointmentId,
        title: booked.title ?? title,
        startIso: booked.startTime,
        endIso: booked.endTime ?? endTime,
      },
    };
  }

  private async resolveGhl(
    callId: string,
  ): Promise<GhlResolveResult> {
    const call = await this.callsRepository.findById(callId);
    if (!call) {
      return {
        ok: false,
        error: 'call_not_found',
        message: 'Call not found for GHL calendar tool request.',
      };
    }

    if (!call.organizationId || !call.organizationAgentId) {
      return {
        ok: false,
        error: 'no_org_agent',
        message:
          'This call has no organization agent. GHL calendar tools require an org agent with a linked GoHighLevel calendar. Platform template web tests cannot use org calendars.',
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
          'No calendar integration is linked to this agent. In the portal, open the agent and select a GoHighLevel calendar connection.',
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
          'The linked calendar integration was not found. Re-link a valid GoHighLevel connection on the agent.',
      };
    }

    if (!integration.isActive) {
      return {
        ok: false,
        error: 'integration_inactive',
        message: 'The linked calendar integration is inactive.',
      };
    }

    if (integration.provider !== IntegrationProvider.GHL) {
      return {
        ok: false,
        error: 'unsupported_provider',
        message:
          'This agent is linked to a Nylas calendar. Enable Nylas calendar tools, or link a GoHighLevel connection instead.',
      };
    }

    const locationId = integration.locationId?.trim() ?? '';
    const calendarId = integration.calendarId?.trim() ?? '';
    if (!locationId || !calendarId) {
      return {
        ok: false,
        error: 'ghl_incomplete',
        message:
          'The GoHighLevel connection is missing location id or calendar id. Edit it in Integrations.',
      };
    }

    this.logger.log(
      `ghl resolve callId=${callId} integration=${integration.id} location=${locationId} calendarId=${calendarId}`,
    );

    return {
      ok: true,
      call,
      creds: {
        token: integration.apiKey,
        locationId,
        calendarId,
      },
    };
  }
}

type GhlResolveResult =
  | {
      ok: true;
      call: { context?: Record<string, unknown> | null };
      creds: GhlCalendarCreds;
    }
  | { ok: false; error: string; message: string };

function contextField(
  context: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | undefined {
  if (!context) return undefined;
  for (const key of keys) {
    const value = context[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export function resolveIdentity(
  dto: GhlScheduleMeetingDto,
  context: Record<string, unknown> | null | undefined,
): {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
} {
  const email =
    dto.participantEmail?.trim() ||
    contextField(context, 'email', 'participantEmail');
  const phone =
    dto.phone?.trim() ||
    contextField(context, 'phone', 'phoneNumber');
  const full =
    dto.participantName?.trim() ||
    contextField(
      context,
      'name',
      'customerName',
      'fullName',
      'patientName',
    );
  const first =
    contextField(context, 'firstName', 'first_name') ||
    (full ? full.split(/\s+/)[0] : undefined);
  const lastFromFull = full?.split(/\s+/).slice(1).join(' ') || undefined;
  const last = contextField(context, 'lastName', 'last_name') || lastFromFull;
  const name =
    full || (first && last ? `${first} ${last}` : first || last);
  const company = contextField(context, 'company', 'companyName');
  return { firstName: first, lastName: last, name, email, phone, company };
}
