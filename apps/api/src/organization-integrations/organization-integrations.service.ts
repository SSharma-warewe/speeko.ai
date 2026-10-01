import {
  WHATSAPP_TASKS,
  WHATSAPP_AGENT_TOOL_IDS,
  isWhatsAppTaskKey,
  type WhatsAppTaskKey,
  type WhatsAppTaskConfiguration,
} from '@call-agent/contracts';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateOrganizationIntegrationDto } from './dto/create-organization-integration.dto';
import { PreviewGhlCalendarsDto } from './dto/preview-ghl-calendars.dto';
import {
  OrganizationIntegrationResponseDto,
  OrganizationIntegrationTestResponseDto,
  PreviewGhlCalendarsResponseDto,
} from './dto/organization-integration-response.dto';
import { UpdateOrganizationIntegrationDto } from './dto/update-organization-integration.dto';
import {
  apiKeyPrefixFrom,
  toOrganizationIntegrationResponse,
} from './mappers/organization-integration-response.mapper';
import {
  IntegrationProvider,
  OrganizationIntegration,
} from './organization-integration.entity';
import { OrganizationIntegrationsRepository } from './organization-integrations.repository';
import { GhlService } from '../ghl/ghl.service';
import { OrganizationAgent } from '../agents/organization-agent.entity';
import { ToolProfilesService } from '../tools/tool-profiles.service';
import { whatsappGhlToolIds } from '../whatsapp-agent/whatsapp-booking-tool-ids';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetaWhatsAppClient } from '../meta-whatsapp/meta-whatsapp.client';
import { NylasService } from './nylas.service';

const DEFAULT_API_URI = 'https://api.us.nylas.com';

const SUPPORTED_PROVIDERS: readonly IntegrationProvider[] = [
  IntegrationProvider.NYLAS,
  IntegrationProvider.GHL,
  IntegrationProvider.GHL_CONTACTS,
  IntegrationProvider.GHL_CRM,
  IntegrationProvider.WHATSAPP,
];

/** One connection per org (WhatsApp outbound picks the active one). */
const SINGLETON_PROVIDERS: readonly IntegrationProvider[] = [
  IntegrationProvider.GHL_CONTACTS,
  IntegrationProvider.WHATSAPP,
];

@Injectable()
export class OrganizationIntegrationsService {
  constructor(
    private readonly repository: OrganizationIntegrationsRepository,
    private readonly organizationsService: OrganizationsService,
    private readonly nylas: NylasService,
    @Inject(forwardRef(() => GhlService))
    private readonly ghl: GhlService,
    private readonly meta: MetaWhatsAppClient,
    @InjectRepository(OrganizationAgent)
    private readonly voiceAgents: Repository<OrganizationAgent>,
    private readonly toolProfiles: ToolProfilesService,
  ) {}

  async listForOrg(
    organizationId: string,
  ): Promise<OrganizationIntegrationResponseDto[]> {
    await this.organizationsService.findById(organizationId);
    const rows = await this.repository.findByOrganization(organizationId);
    return rows.map(toOrganizationIntegrationResponse);
  }

  async getOneForOrg(
    organizationId: string,
    id: string,
  ): Promise<OrganizationIntegrationResponseDto> {
    const row = await this.loadForOrg(organizationId, id);
    return toOrganizationIntegrationResponse(row);
  }

  /** Internal: full entity including apiKey for Nylas proxy. */
  async getEntityForOrg(
    organizationId: string,
    id: string,
  ): Promise<OrganizationIntegration> {
    return this.loadForOrg(organizationId, id);
  }

  async createForOrg(
    organizationId: string,
    dto: CreateOrganizationIntegrationDto,
    createdByUserId?: string | null,
  ): Promise<OrganizationIntegrationResponseDto> {
    await this.organizationsService.findById(organizationId);

    const provider = dto.provider ?? IntegrationProvider.NYLAS;
    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      throw new BadRequestException(
        `Unsupported integration provider: ${provider}. Supported: ${SUPPORTED_PROVIDERS.join(', ')}.`,
      );
    }

    if (SINGLETON_PROVIDERS.includes(provider)) {
      const existing = await this.repository.findByOrganization(organizationId);
      if (existing.some((r) => r.provider === provider)) {
        throw new ConflictException(
          provider === IntegrationProvider.WHATSAPP
            ? 'A WhatsApp connection already exists. Edit or delete it first.'
            : 'A GoHighLevel contacts connection already exists. Edit or delete it first.',
        );
      }
    }

    const apiKey = dto.apiKey.trim();
    if (apiKey.length < 8 || !dto.name.trim()) {
      throw new BadRequestException(
        'Name and a valid integration token are required.',
      );
    }
    let row: OrganizationIntegration;
    switch (provider) {
      case IntegrationProvider.GHL:
        row = this.buildGhlRow(organizationId, dto, apiKey, createdByUserId);
        break;
      case IntegrationProvider.GHL_CRM:
      case IntegrationProvider.GHL_CONTACTS:
        row = this.buildGhlContactsRow(
          organizationId,
          dto,
          apiKey,
          createdByUserId,
        );
        break;
      case IntegrationProvider.WHATSAPP:
        row = this.buildWhatsAppRow(
          organizationId,
          dto,
          apiKey,
          createdByUserId,
        );
        break;
      default:
        row = this.buildNylasRow(organizationId, dto, apiKey, createdByUserId);
    }
    const saved = await this.repository.save(row);
    return toOrganizationIntegrationResponse(saved);
  }

  /**
   * Internal: the org's active connection for a singleton provider
   * (`whatsapp` / `ghl_contacts`), including the secret. Throws NotFound when
   * missing or inactive.
   */
  async getActiveEntityByProvider(
    organizationId: string,
    provider: IntegrationProvider,
  ): Promise<OrganizationIntegration> {
    await this.organizationsService.findById(organizationId);
    const rows = await this.repository.findByOrganization(organizationId);
    const row = rows.find((r) => r.provider === provider && r.isActive);
    if (!row) {
      throw new NotFoundException(
        provider === IntegrationProvider.WHATSAPP
          ? 'No active WhatsApp connection. Add one in WhatsApp > Connections.'
          : 'No active GoHighLevel contacts connection. Add one in WhatsApp > Connections.',
      );
    }
    return row;
  }

  /** Active WhatsApp connection for an inbound phone_number_id (includes apiKey). */
  findActiveWhatsAppByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<OrganizationIntegration | null> {
    const id = phoneNumberId.trim();
    if (!id) return Promise.resolve(null);
    return this.repository.findActiveWhatsAppByPhoneNumberId(id);
  }

  async getWhatsAppAgent(organizationId: string): Promise<{
    taskKey: WhatsAppTaskKey | null;
    systemPrompt: string | null;
    bookingVoiceAgentId: string | null;
    whatsappToolProfileId: string | null;
  }> {
    await this.organizationsService.findById(organizationId);
    const rows = await this.repository.findByOrganization(organizationId);
    const row = rows.find(
      (integration) =>
        integration.provider === IntegrationProvider.WHATSAPP &&
        integration.isActive,
    );
    return {
      taskKey: row?.whatsappTaskKey ?? null,
      systemPrompt: row?.systemPrompt ?? null,
      bookingVoiceAgentId: row?.bookingVoiceAgentId ?? null,
      whatsappToolProfileId: row?.whatsappToolProfileId ?? null,
    };
  }

  async updateWhatsAppAgent(
    organizationId: string,
    systemPrompt: string,
    bookingVoiceAgentId?: string | null,
    whatsappToolProfileId?: string | null,
    taskKey?: WhatsAppTaskKey | null,
  ): Promise<{
    taskKey: WhatsAppTaskKey | null;
    systemPrompt: string | null;
    bookingVoiceAgentId: string | null;
    whatsappToolProfileId: string | null;
  }> {
    const row = await this.getActiveEntityByProvider(
      organizationId,
      IntegrationProvider.WHATSAPP,
    );
    const trimmed = systemPrompt.trim();
    const nextAgentId =
      bookingVoiceAgentId === undefined
        ? row.bookingVoiceAgentId
        : bookingVoiceAgentId;
    const nextProfileId =
      whatsappToolProfileId === undefined
        ? row.whatsappToolProfileId
        : whatsappToolProfileId;
    if (nextProfileId && !nextAgentId) {
      throw new BadRequestException(
        'Select a voice agent with a GHL calendar for this tool profile.',
      );
    }
    if (whatsappToolProfileId) {
      await this.toolProfiles.getResponseForOrganization(
        organizationId,
        whatsappToolProfileId,
      );
      const ids = await this.toolProfiles.resolveEnabledToolIds(
        whatsappToolProfileId,
        organizationId,
      );
      const ghlIds = whatsappGhlToolIds(ids);
      if (ghlIds.length === 0) {
        throw new BadRequestException(
          'This tool profile has no assigned GHL contact or calendar tools.',
        );
      }
      if (
        ghlIds.includes('scheduleGhlMeeting') &&
        (!ghlIds.includes('checkGhlFreeSlots') ||
          (!ghlIds.includes('lookupGhlContact') &&
            !ghlIds.includes('upsertGhlContact')))
      ) {
        throw new BadRequestException(
          'WhatsApp booking profiles need free slots and a GHL contact tool alongside scheduleGhlMeeting.',
        );
      }
    }
    if (bookingVoiceAgentId !== undefined) {
      if (bookingVoiceAgentId) {
        const agent = await this.voiceAgents.findOne({
          where: { id: bookingVoiceAgentId, organizationId },
        });
        if (!agent || !agent.isActive)
          throw new NotFoundException(
            'Active voice agent not found in this organization.',
          );
        if (!agent.calendarIntegrationId)
          throw new BadRequestException(
            'Select a voice agent with a linked GHL calendar.',
          );
        const calendar = await this.loadForOrg(
          organizationId,
          agent.calendarIntegrationId,
        );
        if (
          calendar.provider !== IntegrationProvider.GHL ||
          !calendar.isActive ||
          !calendar.apiKey?.trim() ||
          !calendar.locationId?.trim() ||
          !calendar.calendarId?.trim()
        ) {
          throw new BadRequestException(
            'The selected voice agent needs a complete active GHL calendar connection.',
          );
        }
      }
      row.bookingVoiceAgentId = bookingVoiceAgentId;
    }
    if (whatsappToolProfileId !== undefined) {
      row.whatsappToolProfileId = whatsappToolProfileId;
    }
    if (taskKey !== undefined) row.whatsappTaskKey = taskKey;
    row.systemPrompt = trimmed.length > 0 ? trimmed : null;
    if (row.whatsappTaskKey && trimmed)
      await this.whatsAppTaskConfiguration(row);
    const saved = await this.repository.save(row);
    return {
      taskKey: saved.whatsappTaskKey ?? null,
      systemPrompt: saved.systemPrompt ?? null,
      bookingVoiceAgentId: saved.bookingVoiceAgentId ?? null,
      whatsappToolProfileId: saved.whatsappToolProfileId ?? null,
    };
  }

  /** Secrets never enter this immutable task snapshot. */
  async whatsAppTaskConfiguration(
    row: OrganizationIntegration,
  ): Promise<WhatsAppTaskConfiguration> {
    if (!isWhatsAppTaskKey(row.whatsappTaskKey) || !row.systemPrompt?.trim())
      throw new BadRequestException(
        'Select a WhatsApp task and enter a persona.',
      );
    if (!row.bookingVoiceAgentId || !row.whatsappToolProfileId)
      throw new BadRequestException(
        'Task requires a booking tool profile and GHL voice agent.',
      );
    await this.toolProfiles.getResponseForOrganization(
      row.organizationId,
      row.whatsappToolProfileId,
    );
    const ids = await this.toolProfiles.resolveEnabledToolIds(
      row.whatsappToolProfileId,
      row.organizationId,
    );
    if (
      !ids.includes('scheduleGhlMeeting') ||
      !ids.includes('checkGhlFreeSlots') ||
      !(ids.includes('lookupGhlContact') || ids.includes('upsertGhlContact'))
    )
      throw new BadRequestException(
        'Task requires scheduleGhlMeeting, checkGhlFreeSlots and a contact tool assigned to this organization.',
      );
    const agent = await this.voiceAgents.findOne({
      where: {
        id: row.bookingVoiceAgentId,
        organizationId: row.organizationId,
      },
    });
    if (!agent?.isActive || !agent.calendarIntegrationId)
      throw new BadRequestException(
        'Task requires an active voice agent linked to a GHL calendar.',
      );
    const calendar = await this.loadForOrg(
      row.organizationId,
      agent.calendarIntegrationId,
    );
    if (
      !calendar.isActive ||
      calendar.provider !== IntegrationProvider.GHL ||
      !calendar.apiKey?.trim() ||
      !calendar.locationId?.trim() ||
      !calendar.calendarId?.trim()
    )
      throw new BadRequestException(
        'Task requires a complete active GHL calendar connection.',
      );
    const task = WHATSAPP_TASKS[row.whatsappTaskKey];
    return {
      key: row.whatsappTaskKey,
      version: task.version,
      objective: task.objective,
      completionRule: 'ghl_appointment_created',
      persona: row.systemPrompt.trim(),
      toolProfileId: row.whatsappToolProfileId,
      voiceAgentId: agent.id,
      calendarIntegrationId: calendar.id,
      locationId: calendar.locationId,
      calendarId: calendar.calendarId,
      enabledTools: WHATSAPP_AGENT_TOOL_IDS.filter((id) => ids.includes(id)),
    };
  }

  async updateForOrg(
    organizationId: string,
    id: string,
    dto: UpdateOrganizationIntegrationDto,
  ): Promise<OrganizationIntegrationResponseDto> {
    const row = await this.loadForOrg(organizationId, id);

    if (dto.name !== undefined) {
      if (!dto.name.trim())
        throw new BadRequestException('An integration name is required.');
      row.name = dto.name.trim();
    }
    if (dto.apiKey !== undefined) {
      const apiKey = dto.apiKey.trim();
      if (apiKey.length < 8)
        throw new BadRequestException('A valid integration token is required.');
      row.apiKey = apiKey;
      row.apiKeyPrefix = apiKeyPrefixFrom(apiKey);
    }
    if (row.provider === IntegrationProvider.WHATSAPP) {
      if (dto.phoneNumberId !== undefined) {
        row.phoneNumberId = dto.phoneNumberId.trim();
      }
      if (dto.wabaId !== undefined) {
        row.wabaId = dto.wabaId.trim();
      }
    } else if (
      row.provider === IntegrationProvider.GHL_CONTACTS ||
      row.provider === IntegrationProvider.GHL_CRM
    ) {
      if (dto.locationId !== undefined) {
        const locationId = dto.locationId.trim();
        if (!locationId) {
          throw new BadRequestException('locationId cannot be empty.');
        }
        if (
          row.provider === IntegrationProvider.GHL_CRM &&
          !/^[a-zA-Z0-9_-]{1,120}$/.test(locationId)
        )
          throw new BadRequestException('Invalid CRM location ID.');
        row.locationId = locationId;
      }
    } else if (row.provider === IntegrationProvider.GHL) {
      if (dto.locationId !== undefined) {
        const locationId = dto.locationId.trim();
        if (!locationId) {
          throw new BadRequestException(
            'locationId cannot be empty for GoHighLevel.',
          );
        }
        row.locationId = locationId;
      }
      if (dto.calendarId !== undefined) {
        const calendarId = dto.calendarId.trim();
        if (!calendarId) {
          throw new BadRequestException(
            'calendarId cannot be empty for GoHighLevel.',
          );
        }
        row.calendarId = calendarId.slice(0, 255);
      }
    } else {
      if (dto.grantId !== undefined) {
        row.grantId = dto.grantId.trim();
      }
      if (dto.calendarId !== undefined) {
        row.calendarId = (dto.calendarId.trim() || 'primary').slice(0, 255);
      }
      if (dto.apiUri !== undefined) {
        row.apiUri = dto.apiUri.trim().replace(/\/$/, '') || DEFAULT_API_URI;
      }
      if (dto.email !== undefined) {
        row.email = dto.email?.trim().toLowerCase() || null;
      }
    }
    if (dto.isActive !== undefined) {
      row.isActive = dto.isActive;
    }

    const saved = await this.repository.save(row);
    return toOrganizationIntegrationResponse(saved);
  }

  async removeForOrg(organizationId: string, id: string): Promise<void> {
    const row = await this.loadForOrg(organizationId, id);
    await this.repository.remove(row);
  }

  async testConnection(
    organizationId: string,
    id: string,
  ): Promise<OrganizationIntegrationTestResponseDto> {
    const row = await this.loadForOrg(organizationId, id);
    if (!row.isActive) {
      return { ok: false, message: 'Integration is inactive' };
    }
    if (row.provider === IntegrationProvider.GHL) {
      return this.testGhlConnection(row);
    }
    if (row.provider === IntegrationProvider.GHL_CRM) {
      await this.ghl.crmRequest(
        { token: row.apiKey, locationId: row.locationId ?? '' },
        'GET',
        `/contacts/?${new URLSearchParams({ locationId: row.locationId ?? '', limit: '1' })}`,
      );
      return {
        ok: true,
        message:
          'Connected — contacts are readable. Other CRM features require their own permissions.',
      };
    }
    if (row.provider === IntegrationProvider.GHL_CONTACTS) {
      return this.testGhlContactsConnection(row);
    }
    if (row.provider === IntegrationProvider.WHATSAPP) {
      return this.testWhatsAppConnection(row);
    }

    if (row.provider !== IntegrationProvider.NYLAS) {
      return {
        ok: false,
        message: `Unsupported provider: ${String(row.provider)}`,
      };
    }

    const result = await this.nylas.listCalendars({
      apiKey: row.apiKey,
      grantId: row.grantId ?? '',
      calendarId: row.calendarId,
      apiUri: row.apiUri,
      email: row.email,
    });

    if (!result.ok) {
      return {
        ok: false,
        message: result.message || 'Nylas connection test failed',
      };
    }

    return {
      ok: true,
      message: `Connected — ${result.data.length} calendar(s) found`,
      calendarIds: result.data.map((c) => c.id).filter(Boolean),
    };
  }

  private buildNylasRow(
    organizationId: string,
    dto: CreateOrganizationIntegrationDto,
    apiKey: string,
    createdByUserId?: string | null,
  ): OrganizationIntegration {
    const grantId = dto.grantId?.trim() ?? '';
    if (!grantId) {
      throw new BadRequestException('grantId is required for Nylas.');
    }
    return this.repository.create({
      organizationId,
      provider: IntegrationProvider.NYLAS,
      name: dto.name.trim(),
      apiKey,
      apiKeyPrefix: apiKeyPrefixFrom(apiKey),
      grantId,
      locationId: null,
      phoneNumberId: null,
      wabaId: null,
      calendarId: (dto.calendarId?.trim() || 'primary').slice(0, 255),
      apiUri: (dto.apiUri?.trim() || DEFAULT_API_URI).replace(/\/$/, ''),
      email: dto.email?.trim().toLowerCase() || null,
      isActive: true,
      createdByUserId: createdByUserId ?? null,
    });
  }

  private buildGhlRow(
    organizationId: string,
    dto: CreateOrganizationIntegrationDto,
    apiKey: string,
    createdByUserId?: string | null,
  ): OrganizationIntegration {
    const locationId = dto.locationId?.trim() ?? '';
    const calendarId = dto.calendarId?.trim() ?? '';
    if (!locationId) {
      throw new BadRequestException('locationId is required for GoHighLevel.');
    }
    if (!calendarId) {
      throw new BadRequestException('calendarId is required for GoHighLevel.');
    }
    return this.repository.create({
      organizationId,
      provider: IntegrationProvider.GHL,
      name: dto.name.trim(),
      apiKey,
      apiKeyPrefix: apiKeyPrefixFrom(apiKey),
      grantId: null,
      locationId,
      phoneNumberId: null,
      wabaId: null,
      calendarId: calendarId.slice(0, 255),
      apiUri: DEFAULT_API_URI,
      email: null,
      isActive: true,
      createdByUserId: createdByUserId ?? null,
    });
  }

  private buildGhlContactsRow(
    organizationId: string,
    dto: CreateOrganizationIntegrationDto,
    apiKey: string,
    createdByUserId?: string | null,
  ): OrganizationIntegration {
    const locationId = dto.locationId?.trim() ?? '';
    if (
      dto.provider === IntegrationProvider.GHL_CRM &&
      !/^[a-zA-Z0-9_-]{1,120}$/.test(locationId)
    )
      throw new BadRequestException('A valid CRM location ID is required.');
    if (!locationId) {
      throw new BadRequestException(
        'locationId is required for GoHighLevel contacts.',
      );
    }
    return this.repository.create({
      organizationId,
      provider:
        dto.provider === IntegrationProvider.GHL_CRM
          ? IntegrationProvider.GHL_CRM
          : IntegrationProvider.GHL_CONTACTS,
      name: dto.name.trim(),
      apiKey,
      apiKeyPrefix: apiKeyPrefixFrom(apiKey),
      grantId: null,
      locationId,
      phoneNumberId: null,
      wabaId: null,
      calendarId: 'primary',
      apiUri: DEFAULT_API_URI,
      email: null,
      isActive: true,
      createdByUserId: createdByUserId ?? null,
    });
  }

  private buildWhatsAppRow(
    organizationId: string,
    dto: CreateOrganizationIntegrationDto,
    apiKey: string,
    createdByUserId?: string | null,
  ): OrganizationIntegration {
    const phoneNumberId = dto.phoneNumberId?.trim() ?? '';
    const wabaId = dto.wabaId?.trim() ?? '';
    if (!phoneNumberId) {
      throw new BadRequestException('phoneNumberId is required for WhatsApp.');
    }
    if (!wabaId) {
      throw new BadRequestException('wabaId is required for WhatsApp.');
    }
    return this.repository.create({
      organizationId,
      provider: IntegrationProvider.WHATSAPP,
      name: dto.name.trim(),
      apiKey,
      apiKeyPrefix: apiKeyPrefixFrom(apiKey),
      grantId: null,
      locationId: null,
      phoneNumberId,
      wabaId,
      systemPrompt: null,
      calendarId: 'primary',
      apiUri: DEFAULT_API_URI,
      email: null,
      isActive: true,
      createdByUserId: createdByUserId ?? null,
    });
  }

  private async testGhlContactsConnection(
    row: OrganizationIntegration,
  ): Promise<OrganizationIntegrationTestResponseDto> {
    const locationId = row.locationId?.trim() ?? '';
    if (!locationId) {
      return {
        ok: false,
        message: 'Location ID is missing on this connection.',
      };
    }
    const result = await this.ghl.listContacts({
      token: row.apiKey,
      locationId,
      limit: 1,
    });
    if (!result.ok) {
      return {
        ok: false,
        message: result.message || 'GoHighLevel connection test failed',
      };
    }
    return {
      ok: true,
      message:
        result.total !== null
          ? `Connected — ${result.total} contact(s) in this location.`
          : 'Connected — contacts are readable.',
    };
  }

  private async testWhatsAppConnection(
    row: OrganizationIntegration,
  ): Promise<OrganizationIntegrationTestResponseDto> {
    const phoneNumberId = row.phoneNumberId?.trim() ?? '';
    const wabaId = row.wabaId?.trim() ?? '';
    if (!phoneNumberId || !wabaId) {
      return {
        ok: false,
        message: 'Phone number id and WABA id are required on this connection.',
      };
    }
    const phone = await this.meta.getPhoneNumber({
      token: row.apiKey,
      phoneNumberId,
    });
    if (!phone.ok) {
      return {
        ok: false,
        message: `Phone number check failed: ${phone.message}`,
      };
    }
    const templates = await this.meta.listTemplates({
      token: row.apiKey,
      wabaId,
    });
    if (!templates.ok) {
      return {
        ok: false,
        message: `Template list failed (needs whatsapp_business_management): ${templates.message}`,
      };
    }
    const approved = templates.data.filter(
      (t) => t.status === 'APPROVED',
    ).length;
    const from = phone.data.displayPhoneNumber
      ? ` Sending from ${phone.data.displayPhoneNumber}.`
      : '';
    return {
      ok: true,
      message: `Connected — ${approved} approved template(s).${from}`,
    };
  }

  private async testGhlConnection(
    row: OrganizationIntegration,
  ): Promise<OrganizationIntegrationTestResponseDto> {
    const locationId = row.locationId?.trim() ?? '';
    if (!locationId) {
      return {
        ok: false,
        message: 'Location ID is missing on this connection.',
      };
    }

    const result = await this.ghl.listCalendars({
      token: row.apiKey,
      locationId,
    });
    if (!result.ok) {
      return {
        ok: false,
        message: result.message || 'GoHighLevel connection test failed',
      };
    }

    const calendarIds = result.calendars.map((c) => c.id).filter(Boolean);
    const stored = row.calendarId?.trim() ?? '';
    const missingStored =
      stored && !calendarIds.includes(stored)
        ? ` Stored calendar id ${stored} was not in the list.`
        : '';

    return {
      ok: true,
      message: `Connected — ${calendarIds.length} calendar(s) found.${missingStored}`,
      calendarIds,
      calendars: result.calendars,
    };
  }

  /**
   * List GHL calendars for a v3 PIT + location without saving.
   * Used by the portal form before create (GET /calendars/?locationId=).
   */
  async previewGhlCalendars(
    organizationId: string,
    dto: PreviewGhlCalendarsDto,
  ): Promise<PreviewGhlCalendarsResponseDto> {
    await this.organizationsService.findById(organizationId);
    const token = dto.apiKey.trim();
    const locationId = dto.locationId.trim();
    if (!token || !locationId) {
      throw new BadRequestException(
        'apiKey (Private Integration Token) and locationId are required.',
      );
    }

    const result = await this.ghl.listCalendars({ token, locationId });
    if (!result.ok) {
      return {
        ok: false,
        message: result.message || 'Could not list GoHighLevel calendars.',
      };
    }

    return {
      ok: true,
      message: result.calendars.length
        ? `Found ${result.calendars.length} calendar(s) in this location.`
        : 'Connected, but this location has no calendars.',
      calendars: result.calendars,
    };
  }

  private async loadForOrg(
    organizationId: string,
    id: string,
  ): Promise<OrganizationIntegration> {
    await this.organizationsService.findById(organizationId);
    const row = await this.repository.findByIdAndOrg(organizationId, id);
    if (!row) {
      throw new NotFoundException(`Integration not found: ${id}`);
    }
    return row;
  }
}
