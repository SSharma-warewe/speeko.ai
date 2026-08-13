import { Injectable, Logger } from '@nestjs/common';
import { CallsRepository } from '../calls/calls.repository';
import {
  GhlCalendarToolResponseDto,
  GhlFreeSlotsDto,
  GhlScheduleMeetingDto,
} from './dto/ghl-calendar-tool.dto';
import { GhlService } from './ghl.service';
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
 * Worker-facing GHL calendar ops: load call context, then GhlService.
 * Platform env calendar — not org Nylas.
 */
@Injectable()
export class GhlCalendarToolsService {
  private readonly logger = new Logger(GhlCalendarToolsService.name);

  constructor(
    private readonly callsRepository: CallsRepository,
    private readonly ghl: GhlService,
  ) {}

  async freeSlots(
    callId: string,
    dto: GhlFreeSlotsDto,
  ): Promise<GhlCalendarToolResponseDto> {
    const call = await this.callsRepository.findById(callId);
    if (!call) {
      return {
        ok: false,
        error: 'call_not_found',
        message: 'Call not found for GHL calendar tool request.',
      };
    }

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

    const result = await this.ghl.getFreeSlots({
      startMs: window.startSec * 1000,
      endMs: window.endSec * 1000,
      timezone: tz,
    });
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
    const call = await this.callsRepository.findById(callId);
    if (!call) {
      return {
        ok: false,
        error: 'call_not_found',
        message: 'Call not found for GHL calendar tool request.',
      };
    }

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

    const upsert = await this.ghl.upsertContact(identity);
    if (!upsert.ok) {
      this.logger.warn(
        `ghl schedule upsert callId=${callId} error=${upsert.error}`,
      );
      return {
        ok: false,
        error: upsert.error,
        message:
          upsert.error === 'contact_upsert_unavailable'
            ? 'Contact save is not configured (GHL_API_KEY). Cannot book.'
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

    const booked = await this.ghl.createAppointment({
      contactId: upsert.contactId,
      startTime,
      endTime,
      title,
      description: dto.description,
    });
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
}

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
