import { Injectable } from '@nestjs/common';
import { OrganizationAgentsService } from '../agents/organization-agents.service';
import { GhlService } from '../ghl/ghl.service';
import {
  GHL_SLOT_MINUTES,
  addMinutesKeepingOffset,
  expandShortWindowToLocalDays,
  hasNumericUtcOffset,
  parseTimeToUnix,
  pastWindowError,
  unixToIso,
} from '../ghl/ghl-time';
import type { GhlCalendarCreds } from '../ghl/ghl.types';
import { IntegrationProvider } from '../organization-integrations/organization-integration.entity';
import { OrganizationIntegrationsService } from '../organization-integrations/organization-integrations.service';

export type BookingSource = { organizationId: string; voiceAgentId: string };

@Injectable()
export class WhatsAppBookingService {
  constructor(
    private readonly agents: OrganizationAgentsService,
    private readonly integrations: OrganizationIntegrationsService,
    private readonly ghl: GhlService,
  ) {}

  private async creds(source: BookingSource): Promise<GhlCalendarCreds | null> {
    const agent = await this.agents
      .getEntityWithTemplate(source.organizationId, source.voiceAgentId)
      .catch(() => null);
    if (!agent?.isActive || !agent.calendarIntegrationId) return null;
    const row = await this.integrations
      .getEntityForOrg(source.organizationId, agent.calendarIntegrationId)
      .catch(() => null);
    if (
      !row ||
      row.provider !== IntegrationProvider.GHL ||
      !row.isActive ||
      !row.apiKey ||
      !row.locationId ||
      !row.calendarId
    )
      return null;
    return {
      token: row.apiKey,
      locationId: row.locationId,
      calendarId: row.calendarId,
    };
  }

  async freeSlots(
    source: BookingSource,
    input: { startTime: string; endTime: string; timezone?: string },
  ) {
    const creds = await this.creds(source);
    if (!creds)
      return {
        ok: false as const,
        error: 'calendar_unavailable',
        message: 'The linked voice agent has no active GHL calendar.',
      };
    const start = parseTimeToUnix(input.startTime, input.timezone);
    const end = parseTimeToUnix(input.endTime, input.timezone);
    if (start == null || end == null || end <= start)
      return {
        ok: false as const,
        error: 'invalid_time',
        message: 'Provide a valid start and end time.',
      };
    const past = pastWindowError(start, end);
    if (past) return past;
    const window = expandShortWindowToLocalDays(start, end, input.timezone);
    const result = await this.ghl.getFreeSlots(
      {
        startMs: window.startSec * 1000,
        endMs: window.endSec * 1000,
        timezone: input.timezone,
      },
      creds,
    );
    if (!result.ok) return result;
    return {
      ok: true as const,
      slotMinutes: result.slotMinutes,
      timezone: result.timezone,
      slots: result.slots,
    };
  }

  async upsertContact(
    source: BookingSource,
    input: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      company?: string;
      notes?: string;
    },
  ) {
    const creds = await this.creds(source);
    if (!creds)
      return {
        ok: false as const,
        error: 'calendar_unavailable',
        message: 'The linked voice agent has no active GHL calendar.',
      };
    return this.ghl.upsertContact(input, {
      token: creds.token,
      locationId: creds.locationId,
    });
  }

  async scheduleMeeting(
    source: BookingSource,
    input: {
      contactId: string;
      startTime: string;
      endTime?: string;
      timezone?: string;
      title?: string;
      description?: string;
    },
  ) {
    const creds = await this.creds(source);
    if (!creds)
      return {
        ok: false as const,
        error: 'calendar_unavailable',
        message: 'The linked voice agent has no active GHL calendar.',
      };
    const start = parseTimeToUnix(input.startTime, input.timezone);
    const end = input.endTime
      ? parseTimeToUnix(input.endTime, input.timezone)
      : start == null
        ? null
        : start + GHL_SLOT_MINUTES * 60;
    if (start == null || end == null || end <= start)
      return {
        ok: false as const,
        error: 'invalid_time',
        message: 'Provide a valid future meeting time.',
      };
    const past = pastWindowError(start, end);
    if (past) return past;
    const startTime = hasNumericUtcOffset(input.startTime)
      ? input.startTime.trim()
      : unixToIso(start);
    const endTime =
      input.endTime && hasNumericUtcOffset(input.endTime)
        ? input.endTime.trim()
        : input.endTime
          ? unixToIso(end)
          : addMinutesKeepingOffset(startTime, GHL_SLOT_MINUTES);
    return this.ghl.createAppointment(
      {
        contactId: input.contactId,
        startTime,
        endTime,
        title: input.title,
        description: input.description,
      },
      creds,
    );
  }
}
