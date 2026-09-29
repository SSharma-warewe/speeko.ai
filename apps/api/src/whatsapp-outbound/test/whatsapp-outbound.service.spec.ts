import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationProvider } from '@call-agent/contracts';
import type { GhlService } from '../../ghl/ghl.service';
import type { MetaWhatsAppClient } from '../../meta-whatsapp/meta-whatsapp.client';
import type { OrganizationIntegrationsService } from '../../organization-integrations/organization-integrations.service';
import type { SendWhatsAppTemplateDto } from '../dto/send-whatsapp-template.dto';
import type { WhatsAppOutboundMessagesRepository } from '../whatsapp-outbound-messages.repository';
import { WhatsAppOutboundService } from '../whatsapp-outbound.service';

describe('WhatsAppOutboundService', () => {
  const ORG = 'org-1';
  const TOKEN = 'EAAG_org_token_secret';
  const PIT = 'pit-org-secret';

  let integrations: { getActiveEntityByProvider: jest.Mock };
  let meta: { listTemplates: jest.Mock; sendTemplate: jest.Mock };
  let ghl: { listContacts: jest.Mock };
  let messages: {
    create: jest.Mock;
    saveMany: jest.Mock;
    findRecentForOrganization: jest.Mock;
  };
  let service: WhatsAppOutboundService;

  const waIntegration = {
    id: 'int-wa',
    apiKey: TOKEN,
    phoneNumberId: '1065403522',
    wabaId: '1022901293',
  };
  const ghlIntegration = { id: 'int-ghl', apiKey: PIT, locationId: 'loc_1' };

  const approved = {
    id: 't1',
    name: 'reminder',
    language: 'en_US',
    category: 'UTILITY',
    status: 'APPROVED',
    components: [{ type: 'BODY', text: 'Hi {{1}}, see you soon.' }],
  };

  const baseDto = (
    over: Partial<SendWhatsAppTemplateDto> = {},
  ): SendWhatsAppTemplateDto => ({
    templateName: 'reminder',
    language: 'en_US',
    bodyVariables: { '1': { type: 'field', field: 'firstName' } },
    recipients: [
      { name: 'Ada Lovelace', firstName: 'Ada', phone: '+91 98765 43210', ghlContactId: 'c1' },
    ],
    ...over,
  });

  beforeEach(() => {
    integrations = {
      getActiveEntityByProvider: jest.fn(
        async (_org: string, provider: string) =>
          provider === IntegrationProvider.WHATSAPP
            ? waIntegration
            : ghlIntegration,
      ),
    };
    meta = {
      listTemplates: jest.fn().mockResolvedValue({ ok: true, data: [approved] }),
      sendTemplate: jest
        .fn()
        .mockResolvedValue({ ok: true, data: { wamid: 'wamid.ABC' } }),
    };
    ghl = { listContacts: jest.fn() };
    messages = {
      create: jest.fn((d: unknown) => d),
      saveMany: jest.fn(async (rows: unknown[]) => rows),
      findRecentForOrganization: jest.fn().mockResolvedValue([]),
    };
    const config = {
      get: jest.fn((k: string) =>
        k === 'LIVEKIT_SIP_DEFAULT_COUNTRY_CODE' ? '91' : undefined,
      ),
    } as unknown as ConfigService;
    service = new WhatsAppOutboundService(
      integrations as unknown as OrganizationIntegrationsService,
      meta as unknown as MetaWhatsAppClient,
      ghl as unknown as GhlService,
      messages as unknown as WhatsAppOutboundMessagesRepository,
      config,
    );
  });

  describe('listTemplates', () => {
    it('loads from the org WABA with the org token, sendable first', async () => {
      meta.listTemplates.mockResolvedValue({
        ok: true,
        data: [
          { ...approved, name: 'zzz', status: 'PENDING' },
          approved,
        ],
      });
      const result = await service.listTemplates(ORG);
      expect(meta.listTemplates).toHaveBeenCalledWith({
        token: TOKEN,
        wabaId: '1022901293',
      });
      expect(result.templates.map((t) => t.name)).toEqual(['reminder', 'zzz']);
      expect(result.templates[1].sendable).toBe(false);
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    it('propagates a missing connection as 404', async () => {
      integrations.getActiveEntityByProvider.mockRejectedValue(
        new NotFoundException('No active WhatsApp connection'),
      );
      await expect(service.listTemplates(ORG)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('maps a Meta failure to 502', async () => {
      meta.listTemplates.mockResolvedValue({
        ok: false,
        status: 401,
        message: 'Invalid OAuth access token',
      });
      await expect(service.listTemplates(ORG)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  describe('listContacts', () => {
    it('uses the org ghl_contacts token + location and page size', async () => {
      ghl.listContacts.mockResolvedValue({
        ok: true,
        contacts: [{ id: 'c1' }],
        nextCursor: 'next',
        total: 5,
      });
      const result = await service.listContacts(ORG, 'ada', 'cur');
      expect(integrations.getActiveEntityByProvider).toHaveBeenCalledWith(
        ORG,
        IntegrationProvider.GHL_CONTACTS,
      );
      expect(ghl.listContacts).toHaveBeenCalledWith({
        token: PIT,
        locationId: 'loc_1',
        query: 'ada',
        cursor: 'cur',
        limit: 25,
      });
      expect(result).toEqual({
        contacts: [{ id: 'c1' }],
        nextCursor: 'next',
        total: 5,
      });
    });

    it('maps a GHL failure to 502', async () => {
      ghl.listContacts.mockResolvedValue({
        ok: false,
        error: 'ghl_contacts_401',
        message: 'Unauthorized',
      });
      await expect(service.listContacts(ORG)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  describe('send', () => {
    it('sends the template from the org phone number id and logs it', async () => {
      const result = await service.send(ORG, baseDto());

      expect(meta.sendTemplate).toHaveBeenCalledWith({
        token: TOKEN,
        phoneNumberId: '1065403522',
        to: '919876543210',
        templateName: 'reminder',
        language: 'en_US',
        components: [
          { type: 'body', parameters: [{ type: 'text', text: 'Ada' }] },
        ],
      });
      expect(result).toMatchObject({ sent: 1, failed: 0, skipped: 0 });
      expect(result.results[0]).toMatchObject({
        status: 'sent',
        wamid: 'wamid.ABC',
        phone: '919876543210',
        ghlContactId: 'c1',
      });
      expect(messages.saveMany).toHaveBeenCalledTimes(1);
      expect(messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG,
          integrationId: 'int-wa',
          batchKey: result.batchKey,
          templateName: 'reminder',
          status: 'sent',
          wamid: 'wamid.ABC',
        }),
      );
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    it('rejects an unknown template', async () => {
      await expect(
        service.send(ORG, baseDto({ templateName: 'nope' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(meta.sendTemplate).not.toHaveBeenCalled();
    });

    it('rejects a template that is not approved', async () => {
      meta.listTemplates.mockResolvedValue({
        ok: true,
        data: [{ ...approved, status: 'PENDING' }],
      });
      await expect(service.send(ORG, baseDto())).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(meta.sendTemplate).not.toHaveBeenCalled();
    });

    it('requires a source for every body variable', async () => {
      await expect(
        service.send(ORG, baseDto({ bodyVariables: {} })),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.send(
          ORG,
          baseDto({ bodyVariables: { '1': { type: 'field', field: 'ssn' } } }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('skips DND, invalid, duplicate, and empty-variable contacts with reasons', async () => {
      const result = await service.send(
        ORG,
        baseDto({
          recipients: [
            { name: 'Ok', firstName: 'Ok', phone: '9876543210' },
            { name: 'Dnd', firstName: 'Dnd', phone: '9876500001', dnd: true },
            { name: 'Bad', firstName: 'Bad', phone: '12' },
            { name: 'Dup', firstName: 'Dup', phone: '+91 98765 43210' },
            { name: '', phone: '9876500002' },
          ],
        }),
      );
      expect(result).toMatchObject({ sent: 1, failed: 0, skipped: 4 });
      expect(result.results.map((r) => r.status)).toEqual([
        'sent',
        'skipped',
        'skipped',
        'skipped',
        'skipped',
      ]);
      expect(result.results[1].error).toMatch(/Do Not Disturb/);
      expect(result.results[2].error).toMatch(/Invalid phone/);
      expect(result.results[3].error).toMatch(/Duplicate/);
      expect(result.results[4].error).toMatch(/No value for \{\{1\}\}/);
      expect(meta.sendTemplate).toHaveBeenCalledTimes(1);
    });

    it('records per-recipient Meta failures without aborting the batch', async () => {
      meta.sendTemplate
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          message: '(#131026) Message undeliverable',
        })
        .mockResolvedValueOnce({ ok: true, data: { wamid: 'wamid.2' } });
      const result = await service.send(
        ORG,
        baseDto({
          recipients: [
            { name: 'A', firstName: 'A', phone: '9876500001' },
            { name: 'B', firstName: 'B', phone: '9876500002' },
          ],
        }),
      );
      expect(result).toMatchObject({ sent: 1, failed: 1, skipped: 0 });
      expect(result.results[0]).toMatchObject({
        status: 'failed',
        wamid: null,
        error: '(#131026) Message undeliverable',
      });
      expect(messages.saveMany).toHaveBeenCalledTimes(1);
    });

    it('scopes every lookup to the caller org', async () => {
      await service.send('org-b', baseDto());
      expect(integrations.getActiveEntityByProvider).toHaveBeenCalledWith(
        'org-b',
        IntegrationProvider.WHATSAPP,
      );
      expect(messages.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-b' }),
      );
    });

    it('never puts the token in the persisted log rows', async () => {
      await service.send(ORG, baseDto());
      const rows = messages.create.mock.calls.map((c) => JSON.stringify(c[0]));
      expect(rows.join('')).not.toContain(TOKEN);
    });
  });

  describe('listMessages', () => {
    it('reads the latest rows for the org only', async () => {
      messages.findRecentForOrganization.mockResolvedValue([
        {
          id: 'm1',
          batchKey: 'b',
          contactName: 'Ada',
          phone: '9198',
          ghlContactId: null,
          templateName: 't',
          language: 'en',
          status: 'sent',
          wamid: 'w',
          error: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          integrationId: 'int-wa',
          organizationId: ORG,
        },
      ]);
      const rows = await service.listMessages(ORG);
      expect(messages.findRecentForOrganization).toHaveBeenCalledWith(ORG, 100);
      expect(rows[0]).not.toHaveProperty('organizationId');
      expect(rows[0]).not.toHaveProperty('integrationId');
    });
  });
});
