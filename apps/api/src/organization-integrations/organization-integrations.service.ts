import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateOrganizationIntegrationDto } from './dto/create-organization-integration.dto';
import {
  OrganizationIntegrationResponseDto,
  OrganizationIntegrationTestResponseDto,
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
import { NylasService } from './nylas.service';

const DEFAULT_API_URI = 'https://api.us.nylas.com';

@Injectable()
export class OrganizationIntegrationsService {
  constructor(
    private readonly repository: OrganizationIntegrationsRepository,
    private readonly organizationsService: OrganizationsService,
    private readonly nylas: NylasService,
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
    if (provider !== IntegrationProvider.NYLAS) {
      throw new BadRequestException(
        `Unsupported integration provider: ${provider}. Only nylas is supported.`,
      );
    }

    const apiKey = dto.apiKey.trim();
    const row = this.repository.create({
      organizationId,
      provider,
      name: dto.name.trim(),
      apiKey,
      apiKeyPrefix: apiKeyPrefixFrom(apiKey),
      grantId: dto.grantId.trim(),
      calendarId: (dto.calendarId?.trim() || 'primary').slice(0, 255),
      apiUri: (dto.apiUri?.trim() || DEFAULT_API_URI).replace(/\/$/, ''),
      email: dto.email?.trim().toLowerCase() || null,
      isActive: true,
      createdByUserId: createdByUserId ?? null,
    });
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
    if (row.provider !== IntegrationProvider.NYLAS) {
      return { ok: false, message: `Unsupported provider: ${row.provider}` };
    }

    const result = await this.nylas.listCalendars({
      apiKey: row.apiKey,
      grantId: row.grantId,
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
