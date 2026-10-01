import { BadRequestException } from '@nestjs/common';
import { OrganizationIntegrationsService } from '../organization-integrations.service';
import { OrganizationIntegrationsRepository } from '../organization-integrations.repository';
import { OrganizationsService } from '../../organizations/organizations.service';
import { NylasService } from '../nylas.service';
import { GhlService } from '../../ghl/ghl.service';
import { MetaWhatsAppClient } from '../../meta-whatsapp/meta-whatsapp.client';
import { OrganizationAgent } from '../../agents/organization-agent.entity';
import { ToolProfilesService } from '../../tools/tool-profiles.service';
import { Repository } from 'typeorm';

describe('CRM integration credentials', () => {
  const dto = {
    name: 'Clinic CRM',
    provider: 'ghl_crm' as const,
    apiKey: 'pit-private-secret',
    locationId: 'location1',
  };
  const row = {
    ...dto,
    organizationId: 'org-1',
    id: 'crm-1',
    apiKeyPrefix: 'pit-priv…',
    calendarId: 'primary',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    findByIdAndOrg: jest.Mock;
  };
  let ghl: { crmRequest: jest.Mock };
  let service: OrganizationIntegrationsService;
  beforeEach(() => {
    repository = {
      create: jest.fn((data) => ({ ...row, ...data })),
      save: jest.fn(async (data) => data),
      findByIdAndOrg: jest.fn().mockResolvedValue({ ...row }),
    };
    ghl = {
      crmRequest: jest.fn().mockResolvedValue({ contacts: [] }),
    };
    service = new OrganizationIntegrationsService(
      repository as unknown as OrganizationIntegrationsRepository,
      { findById: jest.fn() } as unknown as OrganizationsService,
      {} as NylasService,
      ghl as unknown as GhlService,
      {} as MetaWhatsAppClient,
      {} as Repository<OrganizationAgent>,
      {} as ToolProfilesService,
    );
  });
  it('saves CRM credentials without requiring a calendar or returning the token', async () => {
    const result = await service.createForOrg('org-1', dto);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'ghl_crm',
        locationId: 'location1',
        apiKey: dto.apiKey,
      }),
    );
    expect(result.provider).toBe('ghl_crm');
    expect(result).not.toHaveProperty('apiKey');
    expect(JSON.stringify(result)).not.toContain(dto.apiKey);
  });
  it('tests contacts access with the saved tenant credentials', async () => {
    await expect(
      service.testConnection('org-1', 'crm-1'),
    ).resolves.toMatchObject({ ok: true });
    expect(ghl.crmRequest).toHaveBeenCalledWith(
      { token: dto.apiKey, locationId: 'location1' },
      'GET',
      '/contacts/?locationId=location1&limit=1',
    );
  });
  it.each(['', '../foreign', 'https://evil.test'])(
    'rejects CRM location %s',
    async (locationId) => {
      await expect(
        service.createForOrg('org-1', { ...dto, locationId }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.save).not.toHaveBeenCalled();
    },
  );
  it('keeps the token when updating only the connection name', async () => {
    const result = await service.updateForOrg('org-1', 'crm-1', {
      name: 'Updated CRM',
    });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Updated CRM', apiKey: dto.apiKey }),
    );
    expect(result).not.toHaveProperty('apiKey');
  });
  it('rejects a blank replacement token and location overrides', async () => {
    await expect(
      service.updateForOrg('org-1', 'crm-1', { apiKey: '        ' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.updateForOrg('org-1', 'crm-1', { locationId: '../foreign' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.updateForOrg('org-1', 'crm-1', { name: '   ' }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
