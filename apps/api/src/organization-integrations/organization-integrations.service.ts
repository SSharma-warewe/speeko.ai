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
import { MetaWhatsAppClient } from '../meta-whatsapp/meta-whatsapp.client';
import { NylasService } from './nylas.service';

const DEFAULT_API_URI = 'https://api.us.nylas.com';

const SUPPORTED_PROVIDERS: readonly IntegrationProvider[] = [
  IntegrationProvider.NYLAS,
  IntegrationProvider.GHL,
  IntegrationProvider.GHL_CONTACTS,
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
    let row: OrganizationIntegration;
    switch (provider) {
      case IntegrationProvider.GHL:
        row = this.buildGhlRow(organizationId, dto, apiKey, createdByUserId);
        break;
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

  async updateForOrg(
    organizationId: string,
    id: string,
    dto: UpdateOrganizationIntegrationDto,
  ): Promise<OrganizationIntegrationResponseDto> {
    const row = await this.loadForOrg(organizationId, id);

    if (dto.name !== undefined) {
      row.name = dto.name.trim();
    }
    if (dto.apiKey !== undefined) {
      const apiKey = dto.apiKey.trim();
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
    } else if (row.provider === IntegrationProvider.GHL_CONTACTS) {
      if (dto.locationId !== undefined) {
        const locationId = dto.locationId.trim();
        if (!locationId) {
          throw new BadRequestException('locationId cannot be empty.');
        }
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
    if (row.provider === IntegrationProvider.GHL_CONTACTS) {
      return this.testGhlContactsConnection(row);
    }
    if (row.provider === IntegrationProvider.WHATSAPP) {
      return this.testWhatsAppConnection(row);
    }

    if (row.provider !== IntegrationProvider.NYLAS) {
      return { ok: false, message: `Unsupported provider: ${row.provider}` };
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
      throw new BadRequestException(
        'locationId is required for GoHighLevel.',
      );
    }
    if (!calendarId) {
      throw new BadRequestException(
        'calendarId is required for GoHighLevel.',
      );
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
    if (!locationId) {
      throw new BadRequestException(
        'locationId is required for GoHighLevel contacts.',
      );
    }
    return this.repository.create({
      organizationId,
      provider: IntegrationProvider.GHL_CONTACTS,
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
      throw new BadRequestException(
        'phoneNumberId is required for WhatsApp.',
      );
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
      return { ok: false, message: 'Location ID is missing on this connection.' };
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
      return { ok: false, message: `Phone number check failed: ${phone.message}` };
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
    const approved = templates.data.filter((t) => t.status === 'APPROVED').length;
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
      return { ok: false, message: 'Location ID is missing on this connection.' };
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
