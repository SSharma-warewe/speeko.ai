import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Organization } from '../../organizations/organization.entity';
import { OrganizationsService } from '../../organizations/organizations.service';
import { hashVerifyToken } from '../verify-token.util';
import { WhatsAppWebhookConfig } from '../whatsapp-webhook-config.entity';
import { WhatsAppWebhookConfigsRepository } from '../whatsapp-webhook-configs.repository';
import { WhatsAppWebhookEvent } from '../whatsapp-webhook-event.entity';
import { WhatsAppWebhookEventsRepository } from '../whatsapp-webhook-events.repository';
import { WhatsAppWebhooksService } from '../whatsapp-webhooks.service';

describe('WhatsAppWebhooksService', () => {
  let service: WhatsAppWebhooksService;
  let configs: {
    findByOrganization: jest.Mock;
    findByVerifyTokenHash: jest.Mock;
    findActiveByPhoneNumberId: jest.Mock;
    findActiveByWabaId: jest.Mock;
    findByPhoneNumberIdExcludingOrg: jest.Mock;
    findByWabaIdExcludingOrg: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let events: {
    create: jest.Mock;
    save: jest.Mock;
  };
  let organizationsService: { findById: jest.Mock };
  let configService: { get: jest.Mock };

  const ORG_ID = 'org-id';
  const OTHER_ORG = 'other-org';
  const CFG_ID = 'cfg-id';
  const PHONE_ID = '106540352242922';
  const WABA_ID = '102290129340398';

  const org: Organization = {
    id: ORG_ID,
    name: 'Acme',
    slug: 'acme',
    isActive: true,
  } as Organization;

  const samplePayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: PHONE_ID },
              messages: [{ type: 'text', text: { body: 'Hi' } }],
            },
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    configs = {
      findByOrganization: jest.fn().mockResolvedValue(null),
      findByVerifyTokenHash: jest.fn().mockResolvedValue(null),
      findActiveByPhoneNumberId: jest.fn().mockResolvedValue(null),
      findActiveByWabaId: jest.fn().mockResolvedValue(null),
      findByPhoneNumberIdExcludingOrg: jest.fn().mockResolvedValue(null),
      findByWabaIdExcludingOrg: jest.fn().mockResolvedValue(null),
      create: jest.fn((data) => ({ ...data }) as WhatsAppWebhookConfig),
      save: jest.fn(async (row: WhatsAppWebhookConfig) => ({
        id: CFG_ID,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        ...row,
      })),
    };
    events = {
      create: jest.fn((data) => ({ ...data }) as WhatsAppWebhookEvent),
      save: jest.fn(async (row: WhatsAppWebhookEvent) => ({
        id: 'evt-id',
        ...row,
      })),
    };
    organizationsService = {
      findById: jest.fn().mockResolvedValue(org),
    };
    configService = {
      get: jest.fn((key: string) =>
        key === 'API_BASE_URL' ? 'https://api.example.com' : undefined,
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppWebhooksService,
        { provide: WhatsAppWebhookConfigsRepository, useValue: configs },
        { provide: WhatsAppWebhookEventsRepository, useValue: events },
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(WhatsAppWebhooksService);
  });

  describe('generateConfigForOrg', () => {
    it('1b. stores a caller-provided verify token so Meta dashboard text matches', async () => {
      const result = await service.generateConfigForOrg(ORG_ID, {
        phoneNumberId: PHONE_ID,
        verifyToken: 'vibecoding',
      });

      expect(result.verifyToken).toBe('vibecoding');
      const saved = configs.save.mock.calls[0][0] as WhatsAppWebhookConfig;
      expect(saved.verifyTokenHash).toBe(hashVerifyToken('vibecoding'));

      configs.findByVerifyTokenHash.mockResolvedValue({
        ...saved,
        isActive: true,
      });
      await expect(
        service.verifySubscription('subscribe', 'vibecoding', '1158'),
      ).resolves.toBe('1158');
    });

    it('1a. uses RAILWAY_PUBLIC_DOMAIN when API_BASE_URL is railway.internal', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'API_BASE_URL') return 'http://api.railway.internal:3000';
        if (key === 'RAILWAY_PUBLIC_DOMAIN') {
          return 'api-production-4df4.up.railway.app';
        }
        return undefined;
      });

      const result = await service.generateConfigForOrg(ORG_ID, {
        phoneNumberId: PHONE_ID,
      });

      expect(result.callbackUrl).toBe(
        'https://api-production-4df4.up.railway.app/api/webhooks/whatsapp',
      );
    });

    it('1. stores hash only and returns raw token once', async () => {
      const result = await service.generateConfigForOrg(ORG_ID, {
        phoneNumberId: PHONE_ID,
        wabaId: WABA_ID,
      });

      expect(organizationsService.findById).toHaveBeenCalledWith(ORG_ID);
      expect(result.verifyToken.startsWith('wa_')).toBe(true);
      expect(result).not.toHaveProperty('verifyTokenHash');
      expect(result.callbackUrl).toBe(
        'https://api.example.com/api/webhooks/whatsapp',
      );
      expect(result.phoneNumberId).toBe(PHONE_ID);
      expect(result.wabaId).toBe(WABA_ID);

      const saved = configs.save.mock.calls[0][0] as WhatsAppWebhookConfig;
      expect(saved.verifyTokenHash).toBe(hashVerifyToken(result.verifyToken));
      expect(saved.verifyTokenHash).not.toBe(result.verifyToken);
    });

    it('2. rejects generate when neither id is provided', async () => {
      await expect(service.generateConfigForOrg(ORG_ID, {})).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.generateConfigForOrg(ORG_ID, { phoneNumberId: '  ' }),
      ).rejects.toThrow(/phoneNumberId and\/or wabaId/);
      expect(configs.save).not.toHaveBeenCalled();
    });

    it('3. throws ConflictException when phone id belongs to another org', async () => {
      configs.findByPhoneNumberIdExcludingOrg.mockResolvedValue({
        organizationId: OTHER_ORG,
      });

      await expect(
        service.generateConfigForOrg(ORG_ID, { phoneNumberId: PHONE_ID }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(configs.save).not.toHaveBeenCalled();
    });

    it('4. throws ConflictException when WABA id belongs to another org', async () => {
      configs.findByWabaIdExcludingOrg.mockResolvedValue({
        organizationId: OTHER_ORG,
      });

      await expect(
        service.generateConfigForOrg(ORG_ID, { wabaId: WABA_ID }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('5. rotates the hash so the previous token fails verify', async () => {
      const first = await service.generateConfigForOrg(ORG_ID, {
        phoneNumberId: PHONE_ID,
      });
      const firstSaved = configs.save.mock.calls[0][0] as WhatsAppWebhookConfig;

      configs.findByOrganization.mockResolvedValue({
        id: CFG_ID,
        organizationId: ORG_ID,
        phoneNumberId: PHONE_ID,
        wabaId: null,
        verifyTokenHash: firstSaved.verifyTokenHash,
        verifyTokenPrefix: firstSaved.verifyTokenPrefix,
        isActive: true,
      });

      const second = await service.generateConfigForOrg(ORG_ID, {
        phoneNumberId: PHONE_ID,
      });
      const secondSaved = configs.save.mock.calls[1][0] as WhatsAppWebhookConfig;

      expect(second.verifyToken).not.toBe(first.verifyToken);
      expect(secondSaved.verifyTokenHash).not.toBe(firstSaved.verifyTokenHash);
      expect(secondSaved.id).toBe(CFG_ID);

      configs.findByVerifyTokenHash.mockImplementation(async (hash: string) =>
        hash === secondSaved.verifyTokenHash
          ? { ...secondSaved, isActive: true }
          : null,
      );

      await expect(
        service.verifySubscription('subscribe', first.verifyToken, 'challenge'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.verifySubscription('subscribe', second.verifyToken, '1158'),
      ).resolves.toBe('1158');
    });
  });

  describe('getConfigForOrg', () => {
    it('6. returns config without the raw token', async () => {
      configs.findByOrganization.mockResolvedValue({
        id: CFG_ID,
        organizationId: ORG_ID,
        phoneNumberId: PHONE_ID,
        wabaId: WABA_ID,
        verifyTokenHash: 'a'.repeat(64),
        verifyTokenPrefix: 'wa_abcd1…',
        isActive: true,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      });

      const result = await service.getConfigForOrg(ORG_ID);

      expect(result).not.toHaveProperty('verifyToken');
      expect(result).not.toHaveProperty('verifyTokenHash');
      expect(result.verifyTokenPrefix).toBe('wa_abcd1…');
    });

    it('7. throws NotFoundException when no config exists', async () => {
      await expect(service.getConfigForOrg(ORG_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('verifySubscription', () => {
    it('8. returns hub.challenge when the token matches an active config', async () => {
      const generated = await service.generateConfigForOrg(ORG_ID, {
        phoneNumberId: PHONE_ID,
      });
      const saved = configs.save.mock.calls[0][0] as WhatsAppWebhookConfig;
      configs.findByVerifyTokenHash.mockResolvedValue({
        ...saved,
        isActive: true,
      });

      await expect(
        service.verifySubscription(
          'subscribe',
          generated.verifyToken,
          '1158201444',
        ),
      ).resolves.toBe('1158201444');
    });

    it('9. forbids wrong mode, missing challenge, inactive, or unknown token', async () => {
      await expect(
        service.verifySubscription('unsubscribe', 'wa_x', 'c'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.verifySubscription('subscribe', 'wa_x', ''),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.verifySubscription('subscribe', 'wa_unknown', 'c'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      configs.findByVerifyTokenHash.mockResolvedValue({
        verifyTokenHash: hashVerifyToken('wa_dead'),
        isActive: false,
      });
      await expect(
        service.verifySubscription('subscribe', 'wa_dead', 'c'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('9b. accepts WHATSAPP_VERIFY_TOKEN when no org hash matches', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'WHATSAPP_VERIFY_TOKEN') return 'platform-meta-token';
        if (key === 'API_BASE_URL') return 'https://api.example.com';
        return undefined;
      });
      configs.findByVerifyTokenHash.mockResolvedValue(null);

      await expect(
        service.verifySubscription(
          'subscribe',
          'platform-meta-token',
          '1158201444',
        ),
      ).resolves.toBe('1158201444');
    });
  });

  describe('ingestWebhook', () => {
    it('10. saves matching phone_number_id with org and event type', async () => {
      configs.findActiveByPhoneNumberId.mockResolvedValue({
        organizationId: ORG_ID,
        isActive: true,
      });

      const ack = await service.ingestWebhook(samplePayload);

      expect(ack).toEqual({ success: true });
      expect(configs.findActiveByWabaId).not.toHaveBeenCalled();
      const saved = events.save.mock.calls[0][0] as WhatsAppWebhookEvent;
      expect(saved.organizationId).toBe(ORG_ID);
      expect(saved.eventType).toBe('messages');
      expect(saved.payload).toEqual(samplePayload);
      expect(saved.receivedAt).toBeInstanceOf(Date);
    });

    it('11. falls back to WABA id when phone number is unknown', async () => {
      configs.findActiveByWabaId.mockResolvedValue({
        organizationId: ORG_ID,
        isActive: true,
      });

      await service.ingestWebhook(samplePayload);

      expect(configs.findActiveByPhoneNumberId).toHaveBeenCalledWith(PHONE_ID);
      expect(configs.findActiveByWabaId).toHaveBeenCalledWith(WABA_ID);
      const saved = events.save.mock.calls[0][0] as WhatsAppWebhookEvent;
      expect(saved.organizationId).toBe(ORG_ID);
    });

    it('12. persists unknown ids with null organization and still succeeds', async () => {
      const ack = await service.ingestWebhook(samplePayload);

      expect(ack).toEqual({ success: true });
      const saved = events.save.mock.calls[0][0] as WhatsAppWebhookEvent;
      expect(saved.organizationId).toBeNull();
      expect(saved.eventType).toBe('messages');
    });

    it('13. rejects garbage bodies without inserting', async () => {
      await expect(service.ingestWebhook(null)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.ingestWebhook('nope')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.ingestWebhook({ entry: {} })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(events.save).not.toHaveBeenCalled();
    });
  });
});
