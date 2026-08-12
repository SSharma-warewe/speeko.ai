import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Organization } from '../../organizations/organization.entity';
import { OrganizationsService } from '../../organizations/organizations.service';
import { CreateOrganizationIntegrationDto } from '../dto/create-organization-integration.dto';
import {
  IntegrationProvider,
  OrganizationIntegration,
} from '../organization-integration.entity';
import { OrganizationIntegrationsRepository } from '../organization-integrations.repository';
import { OrganizationIntegrationsService } from '../organization-integrations.service';
import { NylasService } from '../nylas.service';

describe('OrganizationIntegrationsService', () => {
  let service: OrganizationIntegrationsService;
  let repository: {
    findByOrganization: jest.Mock;
    findByIdAndOrg: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let organizationsService: {
    findById: jest.Mock;
  };
  let nylas: {
    listCalendars: jest.Mock;
  };

  const ORG_ID = 'org-id';
  const INT_ID = 'int-id';
  const USER_ID = 'user-id';
  const API_KEY = 'nyk_super_secret_key_value';

  const org: Organization = {
    id: ORG_ID,
    name: 'Acme',
    slug: 'acme',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  } as Organization;

  const integration: OrganizationIntegration = {
    id: INT_ID,
    organizationId: ORG_ID,
    provider: IntegrationProvider.NYLAS,
    name: 'Clinic Calendar',
    apiKey: API_KEY,
    apiKeyPrefix: 'nyk_supe…',
    grantId: 'grant-1',
    calendarId: 'primary',
    apiUri: 'https://api.us.nylas.com',
    email: 'clinic@example.com',
    isActive: true,
    createdByUserId: USER_ID,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  } as OrganizationIntegration;

  const baseDto: CreateOrganizationIntegrationDto = {
    name: '  Clinic Calendar  ',
    apiKey: `  ${API_KEY}  `,
    grantId: '  grant-1  ',
  };

  beforeEach(async () => {
    repository = {
      findByOrganization: jest.fn(),
      findByIdAndOrg: jest.fn(),
      create: jest.fn((data) => ({ ...data }) as OrganizationIntegration),
      save: jest.fn(async (row: OrganizationIntegration) => ({
        id: INT_ID,
        ...row,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      })),
      remove: jest.fn(async (row: OrganizationIntegration) => row),
    };

    organizationsService = {
      findById: jest.fn().mockResolvedValue(org),
    };

    nylas = {
      listCalendars: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationIntegrationsService,
        {
          provide: OrganizationIntegrationsRepository,
          useValue: repository,
        },
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: NylasService, useValue: nylas },
      ],
    }).compile();

    service = module.get(OrganizationIntegrationsService);
  });

  describe('listForOrg', () => {
    it('1. gates on organizationsService.findById', async () => {
      repository.findByOrganization.mockResolvedValue([]);

      await service.listForOrg(ORG_ID);

      expect(organizationsService.findById).toHaveBeenCalledWith(ORG_ID);
    });

    it('2. maps rows and never exposes apiKey', async () => {
      repository.findByOrganization.mockResolvedValue([integration]);

      const result = await service.listForOrg(ORG_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('apiKey');
      expect(result[0].apiKeyPrefix).toBe('nyk_supe…');
      expect(result[0].id).toBe(INT_ID);
    });

    it('3. returns empty array when org has no integrations', async () => {
      repository.findByOrganization.mockResolvedValue([]);

      await expect(service.listForOrg(ORG_ID)).resolves.toEqual([]);
    });

    it('4. propagates NotFoundException when organization is missing', async () => {
      organizationsService.findById.mockRejectedValue(
        new NotFoundException(`Organization not found: ${ORG_ID}`),
      );

      await expect(service.listForOrg(ORG_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.findByOrganization).not.toHaveBeenCalled();
    });
  });

  describe('getOneForOrg', () => {
    it('5. returns mapped response without apiKey', async () => {
      repository.findByIdAndOrg.mockResolvedValue(integration);

      const result = await service.getOneForOrg(ORG_ID, INT_ID);

      expect(result).not.toHaveProperty('apiKey');
      expect(result.id).toBe(INT_ID);
      expect(result.grantId).toBe('grant-1');
    });

    it('6. throws NotFoundException when integration missing for org', async () => {
      repository.findByIdAndOrg.mockResolvedValue(null);

      await expect(service.getOneForOrg(ORG_ID, INT_ID)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getOneForOrg(ORG_ID, INT_ID)).rejects.toThrow(
        `Integration not found: ${INT_ID}`,
      );
    });
  });

  describe('getEntityForOrg', () => {
    it('7. returns full entity including apiKey for internal use', async () => {
      repository.findByIdAndOrg.mockResolvedValue(integration);

      const result = await service.getEntityForOrg(ORG_ID, INT_ID);

      expect(result.apiKey).toBe(API_KEY);
      expect(result).toEqual(integration);
    });
  });

  describe('createForOrg', () => {
    it('8. gates on organization existence first', async () => {
      await service.createForOrg(ORG_ID, baseDto, USER_ID);

      expect(organizationsService.findById).toHaveBeenCalledWith(ORG_ID);
    });

    it('9. defaults provider, calendarId, apiUri, email and isActive', async () => {
      await service.createForOrg(ORG_ID, baseDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          provider: IntegrationProvider.NYLAS,
          calendarId: 'primary',
          apiUri: 'https://api.us.nylas.com',
          email: null,
          isActive: true,
          createdByUserId: null,
        }),
      );
    });

    it('10. trims name, apiKey, grantId and sets apiKeyPrefix', async () => {
      await service.createForOrg(ORG_ID, baseDto, USER_ID);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Clinic Calendar',
          apiKey: API_KEY,
          grantId: 'grant-1',
          apiKeyPrefix: 'nyk_supe…',
          createdByUserId: USER_ID,
        }),
      );
    });

    it('11. normalizes calendarId, strips trailing slash on apiUri, lowercases email', async () => {
      await service.createForOrg(ORG_ID, {
        name: 'EU Calendar',
        apiKey: API_KEY,
        grantId: 'grant-eu',
        calendarId: '  cal-1  ',
        apiUri: 'https://api.eu.nylas.com/',
        email: '  Clinic@Example.COM  ',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: 'cal-1',
          apiUri: 'https://api.eu.nylas.com',
          email: 'clinic@example.com',
        }),
      );
    });

    it('12. throws BadRequestException for unsupported provider', async () => {
      await expect(
        service.createForOrg(ORG_ID, {
          ...baseDto,
          provider: 'other' as IntegrationProvider,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createForOrg(ORG_ID, {
          ...baseDto,
          provider: 'other' as IntegrationProvider,
        }),
      ).rejects.toThrow(/Unsupported integration provider/);

      expect(repository.save).not.toHaveBeenCalled();
    });

    it('13. returns response without apiKey but with prefix', async () => {
      const result = await service.createForOrg(ORG_ID, baseDto, USER_ID);

      expect(result).not.toHaveProperty('apiKey');
      expect(result.apiKeyPrefix).toBe('nyk_supe…');
      expect(result.id).toBe(INT_ID);
      expect(result.name).toBe('Clinic Calendar');
    });
  });

  describe('updateForOrg', () => {
    beforeEach(() => {
      repository.findByIdAndOrg.mockResolvedValue({ ...integration });
    });

    it('14. patches name, email, and isActive', async () => {
      await service.updateForOrg(ORG_ID, INT_ID, {
        name: '  Renamed  ',
        email: '  New@Example.COM  ',
        isActive: false,
      });

      const saved = repository.save.mock.calls[0][0] as OrganizationIntegration;
      expect(saved.name).toBe('Renamed');
      expect(saved.email).toBe('new@example.com');
      expect(saved.isActive).toBe(false);
    });

    it('15. updates apiKey and refreshes apiKeyPrefix', async () => {
      const newKey = 'nyk_brand_new_secret_key';

      await service.updateForOrg(ORG_ID, INT_ID, { apiKey: `  ${newKey}  ` });

      const saved = repository.save.mock.calls[0][0] as OrganizationIntegration;
      expect(saved.apiKey).toBe(newKey);
      expect(saved.apiKeyPrefix).toBe('nyk_bran…');
    });

    it('16. returns mapped response without apiKey', async () => {
      const result = await service.updateForOrg(ORG_ID, INT_ID, {
        name: 'Updated',
      });

      expect(result).not.toHaveProperty('apiKey');
      expect(result.name).toBe('Updated');
    });

    it('17. throws NotFoundException when integration not in org', async () => {
      repository.findByIdAndOrg.mockResolvedValue(null);

      await expect(
        service.updateForOrg(ORG_ID, INT_ID, { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('removeForOrg', () => {
    it('18. removes the loaded row', async () => {
      repository.findByIdAndOrg.mockResolvedValue(integration);

      await service.removeForOrg(ORG_ID, INT_ID);

      expect(repository.remove).toHaveBeenCalledWith(integration);
    });

    it('19. throws NotFoundException when missing', async () => {
      repository.findByIdAndOrg.mockResolvedValue(null);

      await expect(service.removeForOrg(ORG_ID, INT_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });

  describe('testConnection', () => {
    it('20. short-circuits when integration is inactive', async () => {
      repository.findByIdAndOrg.mockResolvedValue({
        ...integration,
        isActive: false,
      });

      const result = await service.testConnection(ORG_ID, INT_ID);

      expect(result).toEqual({
        ok: false,
        message: 'Integration is inactive',
      });
      expect(nylas.listCalendars).not.toHaveBeenCalled();
    });

    it('21. returns failure message when Nylas fails', async () => {
      repository.findByIdAndOrg.mockResolvedValue(integration);
      nylas.listCalendars.mockResolvedValue({
        ok: false,
        status: 401,
        message: 'Unauthorized',
      });

      const result = await service.testConnection(ORG_ID, INT_ID);

      expect(result).toEqual({
        ok: false,
        message: 'Unauthorized',
      });
      expect(nylas.listCalendars).toHaveBeenCalledWith({
        apiKey: API_KEY,
        grantId: 'grant-1',
        calendarId: 'primary',
        apiUri: 'https://api.us.nylas.com',
        email: 'clinic@example.com',
      });
    });

    it('22. returns ok with calendarIds when Nylas succeeds', async () => {
      repository.findByIdAndOrg.mockResolvedValue(integration);
      nylas.listCalendars.mockResolvedValue({
        ok: true,
        data: [
          { id: 'primary', name: 'Primary' },
          { id: 'work', name: 'Work' },
        ],
      });

      const result = await service.testConnection(ORG_ID, INT_ID);

      expect(result).toEqual({
        ok: true,
        message: 'Connected — 2 calendar(s) found',
        calendarIds: ['primary', 'work'],
      });
    });
  });
});
