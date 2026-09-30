import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrganizationAgent } from '../../agents/organization-agent.entity';
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
import { ToolProfilesService } from '../../tools/tool-profiles.service';

describe('OrganizationIntegrationsService — WhatsApp + GHL contacts', () => {
  let service: OrganizationIntegrationsService;
  let repository: {
    findByOrganization: jest.Mock;
    findByIdAndOrg: jest.Mock;
    findActiveWhatsAppByPhoneNumberId: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let ghl: { listContacts: jest.Mock; listCalendars: jest.Mock };
  let meta: { getPhoneNumber: jest.Mock; listTemplates: jest.Mock };
  let voiceAgents: { findOne: jest.Mock };
  let toolProfiles: {
    getResponseForOrganization: jest.Mock;
    resolveEnabledToolIds: jest.Mock;
  };

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
      findActiveWhatsAppByPhoneNumberId: jest.fn().mockResolvedValue(null),
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
    voiceAgents = { findOne: jest.fn() };
    toolProfiles = {
      getResponseForOrganization: jest
        .fn()
        .mockResolvedValue({ id: 'profile-1' }),
      resolveEnabledToolIds: jest
        .fn()
        .mockResolvedValue([
          'upsertGhlContact',
          'checkGhlFreeSlots',
          'scheduleGhlMeeting',
        ]),
    };

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
        { provide: ToolProfilesService, useValue: toolProfiles },
        {
          provide: getRepositoryToken(OrganizationAgent),
          useValue: voiceAgents,
        },
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
          systemPrompt: null,
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

  describe('whatsapp agent prompt', () => {
    it('validates the effective task tools and calendar on persona-only edits, and snapshots no secrets', async () => {
      const row = waRow({
        systemPrompt: 'Original',
        whatsappTaskKey: 'receptionist',
        bookingVoiceAgentId: 'voice-1',
        whatsappToolProfileId: 'profile-1',
      });
      repository.findByOrganization.mockResolvedValue([row]);
      voiceAgents.findOne.mockResolvedValue({
        id: 'voice-1',
        isActive: true,
        calendarIntegrationId: 'calendar-link',
      });
      repository.findByIdAndOrg.mockResolvedValue({
        id: 'calendar-link',
        provider: IntegrationProvider.GHL,
        isActive: true,
        apiKey: PIT,
        locationId: 'location',
        calendarId: 'calendar',
      });
      const saved = await service.updateWhatsAppAgent(ORG_ID, 'New persona');
      expect(saved.taskKey).toBe('receptionist');
      const configuration = await service.whatsAppTaskConfiguration(row);
      expect(configuration).toMatchObject({
        voiceAgentId: 'voice-1',
        toolProfileId: 'profile-1',
        calendarIntegrationId: 'calendar-link',
        persona: 'New persona',
        completionRule: 'ghl_appointment_created',
      });
      expect(JSON.stringify(configuration)).not.toContain(PIT);
      expect(JSON.stringify(configuration)).not.toContain(TOKEN);
      toolProfiles.resolveEnabledToolIds.mockResolvedValue([
        'upsertGhlContact',
        'checkGhlFreeSlots',
      ]);
      repository.save.mockClear();
      await expect(
        service.updateWhatsAppAgent(ORG_ID, 'Updated again'),
      ).rejects.toThrow('scheduleGhlMeeting');
      expect(repository.save).not.toHaveBeenCalled();
      toolProfiles.resolveEnabledToolIds.mockResolvedValue([
        'upsertGhlContact',
        'checkGhlFreeSlots',
        'scheduleGhlMeeting',
      ]);
      voiceAgents.findOne.mockResolvedValue(null);
      await expect(service.whatsAppTaskConfiguration(row)).rejects.toThrow(
        'active voice agent',
      );
    });
    it('returns systemPrompt and never the api key', async () => {
      repository.findByOrganization.mockResolvedValue([
        waRow({ systemPrompt: 'Be brief.' }),
      ]);
      const result = await service.getWhatsAppAgent(ORG_ID);
      expect(result).toEqual({
        taskKey: null,
        systemPrompt: 'Be brief.',
        bookingVoiceAgentId: null,
        whatsappToolProfileId: null,
      });
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    it('returns no org prompt when there is no WhatsApp connection', async () => {
      await expect(service.getWhatsAppAgent(ORG_ID)).resolves.toEqual({
        taskKey: null,
        systemPrompt: null,
        bookingVoiceAgentId: null,
        whatsappToolProfileId: null,
      });
    });

    it('saves a trimmed prompt and clears empty to null', async () => {
      const row = waRow({ systemPrompt: null });
      repository.findByOrganization.mockResolvedValue([row]);
      repository.save.mockImplementation(
        async (r: OrganizationIntegration) => r,
      );

      const saved = await service.updateWhatsAppAgent(ORG_ID, '  Hello  ');
      expect(saved.systemPrompt).toBe('Hello');
      expect(row.systemPrompt).toBe('Hello');
      expect(JSON.stringify(saved)).not.toContain(TOKEN);

      const cleared = await service.updateWhatsAppAgent(ORG_ID, '   ');
      expect(cleared.systemPrompt).toBeNull();
      expect(row.systemPrompt).toBeNull();
    });

    it('links only a same-org voice agent with an active GHL calendar', async () => {
      const row = waRow({
        systemPrompt: 'Book meetings',
        bookingVoiceAgentId: null,
      });
      repository.findByOrganization.mockResolvedValue([row]);
      repository.save.mockImplementation(
        async (r: OrganizationIntegration) => r,
      );
      voiceAgents.findOne.mockResolvedValue({
        id: 'voice-1',
        organizationId: ORG_ID,
        isActive: true,
        calendarIntegrationId: 'calendar-1',
      });
      repository.findByIdAndOrg.mockResolvedValue({
        id: 'calendar-1',
        provider: IntegrationProvider.GHL,
        isActive: true,
        apiKey: 'pit',
        locationId: 'location-1',
        calendarId: 'calendar-1',
      });

      const saved = await service.updateWhatsAppAgent(
        ORG_ID,
        'Book meetings',
        'voice-1',
      );
      expect(saved.bookingVoiceAgentId).toBe('voice-1');
      expect(voiceAgents.findOne).toHaveBeenCalledWith({
        where: { id: 'voice-1', organizationId: ORG_ID },
      });

      voiceAgents.findOne.mockResolvedValue(null);
      await expect(
        service.updateWhatsAppAgent(ORG_ID, 'Book meetings', 'foreign-voice'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(row.bookingVoiceAgentId).toBe('voice-1');
    });

    it('requires a visible assigned GHL tool profile and a calendar source', async () => {
      const row = waRow({
        systemPrompt: 'Book meetings',
        bookingVoiceAgentId: 'voice-1',
        whatsappToolProfileId: null,
      });
      repository.findByOrganization.mockResolvedValue([row]);
      repository.save.mockImplementation(
        async (r: OrganizationIntegration) => r,
      );

      const saved = await service.updateWhatsAppAgent(
        ORG_ID,
        'Book meetings',
        undefined,
        'profile-1',
      );
      expect(saved.whatsappToolProfileId).toBe('profile-1');
      expect(toolProfiles.getResponseForOrganization).toHaveBeenCalledWith(
        ORG_ID,
        'profile-1',
      );
      expect(toolProfiles.resolveEnabledToolIds).toHaveBeenCalledWith(
        'profile-1',
        ORG_ID,
      );

      toolProfiles.resolveEnabledToolIds.mockResolvedValue(['endCall']);
      await expect(
        service.updateWhatsAppAgent(
          ORG_ID,
          'Book meetings',
          undefined,
          'profile-2',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(row.whatsappToolProfileId).toBe('profile-1');

      toolProfiles.resolveEnabledToolIds.mockResolvedValue([
        'scheduleGhlMeeting',
      ]);
      await expect(
        service.updateWhatsAppAgent(
          ORG_ID,
          'Book meetings',
          undefined,
          'profile-3',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.updateWhatsAppAgent(ORG_ID, 'Book meetings', null, 'profile-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
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
