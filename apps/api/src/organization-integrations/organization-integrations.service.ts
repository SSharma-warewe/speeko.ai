import {
  BadRequestException,
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
import { NylasService } from './nylas.service';

const DEFAULT_API_URI = 'https://api.us.nylas.com';

@Injectable()
export class OrganizationIntegrationsService {
  constructor(
    private readonly repository: OrganizationIntegrationsRepository,
    private readonly organizationsService: OrganizationsService,
    private readonly nylas: NylasService,
    @Inject(forwardRef(() => GhlService))
    private readonly ghl: GhlService,
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
    if (
      provider !== IntegrationProvider.NYLAS &&
      provider !== IntegrationProvider.GHL
    ) {
      throw new BadRequestException(
        `Unsupported integration provider: ${provider}. Supported: nylas, ghl.`,
      );
    }

    const apiKey = dto.apiKey.trim();
    const row =
      provider === IntegrationProvider.GHL
        ? this.buildGhlRow(organizationId, dto, apiKey, createdByUserId)
        : this.buildNylasRow(organizationId, dto, apiKey, createdByUserId);
    const saved = await this.repository.save(row);
    return toOrganizationIntegrationResponse(saved);
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
    if (row.provider === IntegrationProvider.GHL) {
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
      calendarId: calendarId.slice(0, 255),
      apiUri: DEFAULT_API_URI,
      email: null,
      isActive: true,
      createdByUserId: createdByUserId ?? null,
    });
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
