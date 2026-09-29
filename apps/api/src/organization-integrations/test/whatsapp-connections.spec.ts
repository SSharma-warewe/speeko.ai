import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GhlService } from '../../ghl/ghl.service';
import { MetaWhatsAppClient } from '../../meta-whatsapp/meta-whatsapp.client';
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

describe('OrganizationIntegrationsService — WhatsApp + GHL contacts', () => {
  let service: OrganizationIntegrationsService;
  let repository: {
    findByOrganization: jest.Mock;
    findByIdAndOrg: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let ghl: { listContacts: jest.Mock; listCalendars: jest.Mock };
  let meta: { getPhoneNumber: jest.Mock; listTemplates: jest.Mock };

  const ORG_ID = 'org-id';
  const TOKEN = 'EAAG_super_secret_meta_token';
  const PIT = 'pit-super-secret-token';

  const org = { id: ORG_ID, isActive: true } as Organization;

  const waRow = (over: Partial<OrganizationIntegration> = {}) =>
    ({
      id: 'wa-1',
      organizationId: ORG_ID,
      provider: IntegrationProvider.WHATSAPP,
      name: 'Line',
      apiKey: TOKEN,
      apiKeyPrefix: 'EAAG_sup…',
      grantId: null,
      locationId: null,
      phoneNumberId: '1065403522',
      wabaId: '1022901293',
      calendarId: 'primary',
      apiUri: 'https://api.us.nylas.com',
      email: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    }) as OrganizationIntegration;

  beforeEach(async () => {
    repository = {
      findByOrganization: jest.fn().mockResolvedValue([]),
      findByIdAndOrg: jest.fn(),
      create: jest.fn((d) => ({ ...d }) as OrganizationIntegration),
      save: jest.fn(async (row: OrganizationIntegration) => ({
        id: 'new-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...row,
      })),
    };
    ghl = { listContacts: jest.fn(), listCalendars: jest.fn() };
    meta = { getPhoneNumber: jest.fn(), listTemplates: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationIntegrationsService,
        { provide: OrganizationIntegrationsRepository, useValue: repository },
        {
          provide: OrganizationsService,
          useValue: { findById: jest.fn().mockResolvedValue(org) },
        },
        { provide: NylasService, useValue: { listCalendars: jest.fn() } },
        { provide: GhlService, useValue: ghl },
        { provide: MetaWhatsAppClient, useValue: meta },
      ],
    }).compile();
    service = module.get(OrganizationIntegrationsService);
  });

  describe('create whatsapp', () => {
    const dto: CreateOrganizationIntegrationDto = {
      name: ' Line ',
      provider: IntegrationProvider.WHATSAPP,
      apiKey: ` ${TOKEN} `,
      phoneNumberId: ' 1065403522 ',
      wabaId: ' 1022901293 ',
    };

    it('stores token + ids and never returns the token', async () => {
      const result = await service.createForOrg(ORG_ID, dto, 'u1');
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: IntegrationProvider.WHATSAPP,
          apiKey: TOKEN,
          phoneNumberId: '1065403522',
          wabaId: '1022901293',
        }),
      );
      expect(result.phoneNumberId).toBe('1065403522');
      expect(result.wabaId).toBe('1022901293');
      expect(JSON.stringify(result)).not.toContain(TOKEN);
      expect(result).not.toHaveProperty('apiKey');
    });

    it('requires phoneNumberId and wabaId', async () => {
      await expect(
        service.createForOrg(ORG_ID, { ...dto, phoneNumberId: undefined }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.createForOrg(ORG_ID, { ...dto, wabaId: undefined }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows only one WhatsApp connection per org', async () => {
      repository.findByOrganization.mockResolvedValue([waRow()]);
      await expect(service.createForOrg(ORG_ID, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('create ghl_contacts', () => {
    const dto: CreateOrganizationIntegrationDto = {
      name: 'Contacts',
      provider: IntegrationProvider.GHL_CONTACTS,
      apiKey: PIT,
      locationId: ' loc_1 ',
    };

    it('needs only a location id (no calendar id)', async () => {
      const result = await service.createForOrg(ORG_ID, dto);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: IntegrationProvider.GHL_CONTACTS,
          locationId: 'loc_1',
        }),
      );
      expect(JSON.stringify(result)).not.toContain(PIT);
    });

    it('rejects a missing location id', async () => {
      await expect(
        service.createForOrg(ORG_ID, { ...dto, locationId: undefined }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('is independent of a calendar ghl connection', async () => {
      repository.findByOrganization.mockResolvedValue([
        waRow({ provider: IntegrationProvider.GHL }),
      ]);
      await expect(service.createForOrg(ORG_ID, dto)).resolves.toBeDefined();
    });
  });

  describe('getActiveEntityByProvider', () => {
    it('returns the active row with its secret for internal use', async () => {
      repository.findByOrganization.mockResolvedValue([
        waRow({ id: 'off', isActive: false }),
        waRow({ id: 'on' }),
      ]);
      const row = await service.getActiveEntityByProvider(
        ORG_ID,
        IntegrationProvider.WHATSAPP,
      );
      expect(row.id).toBe('on');
      expect(row.apiKey).toBe(TOKEN);
    });

    it('404s when missing or inactive', async () => {
      repository.findByOrganization.mockResolvedValue([
        waRow({ isActive: false }),
      ]);
      await expect(
        service.getActiveEntityByProvider(ORG_ID, IntegrationProvider.WHATSAPP),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.getActiveEntityByProvider(
          ORG_ID,
          IntegrationProvider.GHL_CONTACTS,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates whatsapp ids and keeps the token when omitted', async () => {
      const row = waRow();
      repository.findByIdAndOrg.mockResolvedValue(row);
      await service.updateForOrg(ORG_ID, 'wa-1', {
        phoneNumberId: '999999',
        wabaId: '888888',
      });
      expect(row.phoneNumberId).toBe('999999');
      expect(row.wabaId).toBe('888888');
      expect(row.apiKey).toBe(TOKEN);
    });

    it('rejects an empty location on ghl_contacts', async () => {
      repository.findByIdAndOrg.mockResolvedValue(
        waRow({
          provider: IntegrationProvider.GHL_CONTACTS,
          locationId: 'loc_1',
        }),
      );
      await expect(
        service.updateForOrg(ORG_ID, 'wa-1', { locationId: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('testConnection', () => {
    it('whatsapp: checks phone number then templates', async () => {
      repository.findByIdAndOrg.mockResolvedValue(waRow());
      meta.getPhoneNumber.mockResolvedValue({
        ok: true,
        data: { displayPhoneNumber: '+1 555 0100' },
      });
      meta.listTemplates.mockResolvedValue({
        ok: true,
        data: [
          { status: 'APPROVED' },
          { status: 'APPROVED' },
          { status: 'PENDING' },
        ],
      });
      const result = await service.testConnection(ORG_ID, 'wa-1');
      expect(result.ok).toBe(true);
      expect(result.message).toContain('2 approved template');
      expect(meta.getPhoneNumber).toHaveBeenCalledWith({
        token: TOKEN,
        phoneNumberId: '1065403522',
      });
    });

    it('whatsapp: surfaces a Meta permission failure', async () => {
      repository.findByIdAndOrg.mockResolvedValue(waRow());
      meta.getPhoneNumber.mockResolvedValue({
        ok: true,
        data: { displayPhoneNumber: null },
      });
      meta.listTemplates.mockResolvedValue({
        ok: false,
        status: 403,
        message: 'Missing permission',
      });
      const result = await service.testConnection(ORG_ID, 'wa-1');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('whatsapp_business_management');
    });

    it('ghl_contacts: lists one contact to verify the token', async () => {
      repository.findByIdAndOrg.mockResolvedValue(
        waRow({
          provider: IntegrationProvider.GHL_CONTACTS,
          apiKey: PIT,
          locationId: 'loc_1',
        }),
      );
      ghl.listContacts.mockResolvedValue({
        ok: true,
        contacts: [],
        nextCursor: null,
        total: 42,
      });
      const result = await service.testConnection(ORG_ID, 'wa-1');
      expect(result.ok).toBe(true);
      expect(result.message).toContain('42');
      expect(ghl.listContacts).toHaveBeenCalledWith({
        token: PIT,
        locationId: 'loc_1',
        limit: 1,
      });
    });
  });

  it('isolates orgs: a connection in another org is not found', async () => {
    repository.findByIdAndOrg.mockResolvedValue(null);
    await expect(
      service.testConnection('other-org', 'wa-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.findByIdAndOrg).toHaveBeenCalledWith('other-org', 'wa-1');
  });
});
