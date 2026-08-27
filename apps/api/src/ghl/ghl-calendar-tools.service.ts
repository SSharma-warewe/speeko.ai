import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { OrganizationAgentsService } from '../agents/organization-agents.service';
import { Call } from '../calls/call.entity';
import { CallsRepository } from '../calls/calls.repository';
import { IntegrationProvider } from '../organization-integrations/organization-integration.entity';
import { OrganizationIntegrationsService } from '../organization-integrations/organization-integrations.service';
import {
  GhlCalendarToolResponseDto,
  GhlFreeSlotsDto,
  GhlLookupContactDto,
  GhlScheduleMeetingDto,
  GhlUpsertContactDto,
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
    const contactId = resolveGhlContactId(dto, call.context);
    if (!contactId) {
      return {
        ok: false,
        error: 'missing_contact',
        message:
          'Need a GoHighLevel contact id on this call. Call lookupGhlContact with the caller’s email or phone; if none exists, call upsertGhlContact. ghlContactId is then stored on the call. Do not pass a phone number as contactId. Calendar tools do not create contacts.',
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
        contactId,
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

  /**
   * Create or update a GHL contact for this call (same upsert as get-demo,
   * using the org PIT). Persists ghlContactId onto calls.context so
   * scheduleMeeting can book afterwards.
   */
  async upsertContact(
    callId: string,
    dto: GhlUpsertContactDto,
  ): Promise<GhlCalendarToolResponseDto> {
    const resolved = await this.resolveGhl(callId);
    if (!resolved.ok) {
      return resolved;
    }
    const { call, creds } = resolved;

    const identity = resolveIdentity(dto, call.context);
    if (!identity.email && !identity.phone) {
      return {
        ok: false,
        error: 'missing_identity',
        message:
          'Need an email or phone to create a GoHighLevel contact. Ask the caller, or use the number on this call.',
      };
    }

    const result = await this.ghl.upsertContact(
      {
        firstName: identity.firstName,
        lastName: identity.lastName,
        email: identity.email,
        phone: identity.phone,
        company: identity.company,
        notes: dto.notes,
      },
      { token: creds.token, locationId: creds.locationId },
    );
    if (!result.ok) {
      this.logger.warn(
        `ghl upsert contact callId=${callId} error=${result.error}`,
      );
      return {
        ok: false,
        error: result.error,
        message:
          result.message ??
          'Could not create or update the GoHighLevel contact. Check that the Private Integration Token includes contacts.write.',
      };
    }

    call.context = mergeGhlContactContext(call.context, {
      contactId: result.contactId,
      email: identity.email,
      phone: identity.phone,
      firstName: identity.firstName,
      lastName: identity.lastName,
      name: identity.name,
      company: identity.company,
    });
    await this.callsRepository.save(call);

    this.logger.log(
      `ghl upsert contact callId=${callId} ok=true contact=${result.contactId} created=${result.created}`,
    );
    return {
      ok: true,
      message: result.created
        ? 'GoHighLevel contact created. You can now book with scheduleGhlMeeting.'
        : 'GoHighLevel contact updated. You can now book with scheduleGhlMeeting.',
      data: {
        contactId: result.contactId,
        created: result.created,
      },
    };
  }

  /**
   * Read-only GHL contact lookup by email/phone. Persists ghlContactId when found.
   * A miss is ok with found:false — the agent should then call upsertContact.
   */
  async lookupContact(
    callId: string,
    dto: GhlLookupContactDto,
  ): Promise<GhlCalendarToolResponseDto> {
    const resolved = await this.resolveGhl(callId);
    if (!resolved.ok) {
      return resolved;
    }
    const { call, creds } = resolved;

    const identity = resolveIdentity(dto, call.context);
    if (!identity.email && !identity.phone) {
      return {
        ok: false,
        error: 'missing_identity',
        message:
          'Need an email or phone to look up a GoHighLevel contact. Ask the caller, or use the number on this call.',
      };
    }

    const result = await this.ghl.lookupContact(
      { email: identity.email, phone: identity.phone },
      { token: creds.token, locationId: creds.locationId },
    );
    if (!result.ok) {
      this.logger.warn(
        `ghl lookup contact callId=${callId} error=${result.error}`,
      );
      return {
        ok: false,
        error: result.error,
        message:
          result.message ??
          'Could not look up the GoHighLevel contact. Check that the Private Integration Token includes contacts.readonly.',
      };
    }
    if (!result.found) {
      this.logger.log(`ghl lookup contact callId=${callId} ok=true found=false`);
      return {
        ok: true,
        message:
          'No GoHighLevel contact for that email or phone. Call upsertGhlContact to create one, then book.',
        data: { found: false },
      };
    }

    call.context = mergeGhlContactContext(call.context, {
      contactId: result.contactId,
      email: result.email ?? identity.email,
      phone: result.phone ?? identity.phone,
      name: result.name ?? identity.name,
      firstName: identity.firstName,
      lastName: identity.lastName,
      company: identity.company,
    });
    await this.callsRepository.save(call);

    this.logger.log(
      `ghl lookup contact callId=${callId} ok=true found=true contact=${result.contactId}`,
    );
    return {
      ok: true,
      message:
        'GoHighLevel contact found. You can now book with scheduleGhlMeeting.',
      data: { found: true, contactId: result.contactId },
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
      call: Call;
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

export function looksLikePhoneContactId(value: string): boolean {
  const compact = value.trim().replace(/[\s().-]/g, '');
  return /^\+?\d{8,}$/.test(compact);
}

function digitPhone(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 ? digits : undefined;
}

export function resolveGhlContactId(
  dto: GhlScheduleMeetingDto,
  context: Record<string, unknown> | null | undefined,
): string | undefined {
  const phones = [
    digitPhone(dto.phone),
    digitPhone(contextField(context, 'phone', 'phoneNumber', 'toNumber')),
  ].filter((v): v is string => Boolean(v));

  const candidates = [
    dto.contactId?.trim(),
    contextField(context, 'ghlContactId', 'contactId', 'ghl_contact_id'),
  ];
  for (const id of candidates) {
    if (!id) continue;
    if (looksLikePhoneContactId(id)) continue;
    const asDigits = digitPhone(id);
    if (asDigits && phones.includes(asDigits)) continue;
    return id;
  }
  return undefined;
}

type GhlIdentityFields = {
  participantEmail?: string;
  participantName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
};

export function resolveIdentity(
  dto: GhlIdentityFields,
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
    usableGhlEmail(dto.participantEmail) ||
    usableGhlEmail(contextField(context, 'email', 'participantEmail'));
  const phone =
    usableIdentityToken(dto.phone) ||
    contextField(context, 'phone', 'phoneNumber', 'toNumber');
  const full =
    usableIdentityToken(dto.participantName) ||
    contextField(
      context,
      'name',
      'customerName',
      'fullName',
      'patientName',
    );
  const first =
    usableIdentityToken(dto.firstName) ||
    contextField(context, 'firstName', 'first_name') ||
    (full ? full.split(/\s+/)[0] : undefined);
  const lastFromFull = full?.split(/\s+/).slice(1).join(' ') || undefined;
  const last =
    usableIdentityToken(dto.lastName) ||
    contextField(context, 'lastName', 'last_name') ||
    lastFromFull;
  const name =
    full || (first && last ? `${first} ${last}` : first || last);
  const company =
    usableIdentityToken(dto.company) ||
    contextField(context, 'company', 'companyName');
  return { firstName: first, lastName: last, name, email, phone, company };
}

/** Drop LLM placeholders like "Unknown" that GHL rejects as invalid emails. */
export function usableGhlEmail(value?: string): string | undefined {
  const email = value?.trim().toLowerCase();
  if (!email) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return undefined;
  const local = email.slice(0, email.indexOf('@'));
  if (isPlaceholderIdentity(local)) return undefined;
  return email;
}

function usableIdentityToken(value?: string): string | undefined {
  const token = value?.trim();
  if (!token || isPlaceholderIdentity(token)) return undefined;
  return token;
}

function isPlaceholderIdentity(value: string): boolean {
  return /^(unknown|n\/a|na|none|null|undefined|test|user|email|caller)$/i.test(
    value.trim(),
  );
}

export function mergeGhlContactContext(
  context: Record<string, unknown> | null | undefined,
  input: {
    contactId: string;
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    company?: string;
  },
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(context ?? {}) };
  next.ghlContactId = input.contactId;
  const fill = (key: string, value?: string) => {
    if (!value) return;
    const existing = next[key];
    if (typeof existing !== 'string' || !existing.trim()) {
      next[key] = value;
    }
  };
  fill('email', input.email);
  fill('phone', input.phone);
  fill('phoneNumber', input.phone);
  fill('firstName', input.firstName);
  fill('lastName', input.lastName);
  fill('name', input.name);
  fill('company', input.company);
  return next;
}
