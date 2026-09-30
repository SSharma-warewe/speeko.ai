import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { WhatsAppHarnessService } from '../whatsapp-harness.service';
import type { WhatsAppHarnessRepository } from '../whatsapp-harness.repository';
import type { OrganizationIntegrationsService } from '../../organization-integrations/organization-integrations.service';
import type { OrganizationsService } from '../../organizations/organizations.service';
import type { ToolProfilesService } from '../../tools/tool-profiles.service';
import type { WhatsAppBookingService } from '../../whatsapp-agent/whatsapp-booking.service';
import type { MetaWhatsAppClient } from '../../meta-whatsapp/meta-whatsapp.client';

describe('WhatsApp harness API boundaries', () => {
  const repository = {
    ingest: jest.fn(),
    withTurn: jest.fn(),
    reserveTool: jest.fn(),
    finishTool: jest.fn(),
    reserveSend: jest.fn(),
    withSend: jest.fn(),
    checkpoint: jest.fn(),
    complete: jest.fn(),
  };
  const integrations = {
    findActiveWhatsAppByPhoneNumberId: jest.fn(),
    getEntityForOrg: jest.fn(),
  };
  const organizations = { findById: jest.fn() };
  const profiles = {
    getResponseForOrganization: jest.fn(),
    resolveEnabledToolIds: jest.fn(),
  };
  const booking = { lookupContact: jest.fn(), scheduleMeeting: jest.fn() };
  const meta = { sendText: jest.fn() };
  const connection = {
    id: 'connection',
    organizationId: 'org',
    provider: 'whatsapp',
    apiKey: 'org-secret',
    isActive: true,
    systemPrompt: 'Persona',
    phoneNumberId: '12345678',
    bookingVoiceAgentId: 'voice',
    whatsappToolProfileId: 'profile',
  };
  const conversation = {
    id: 'conversation',
    organizationId: 'org',
    connectionId: 'connection',
    sender: '919876543210',
    toolState: {} as Record<string, unknown>,
  };
  let service: WhatsAppHarnessService;
  beforeEach(() => {
    jest.resetAllMocks();
    conversation.toolState = {};
    integrations.findActiveWhatsAppByPhoneNumberId.mockResolvedValue(
      connection,
    );
    integrations.getEntityForOrg.mockResolvedValue(connection);
    organizations.findById.mockResolvedValue({ id: 'org', isActive: true });
    profiles.resolveEnabledToolIds.mockResolvedValue(['lookupGhlContact']);
    repository.withTurn.mockImplementation((_id, _lease, action) =>
      action({ conversation }),
    );
    repository.reserveTool.mockResolvedValue({ fresh: true, operation: {} });
    booking.lookupContact.mockResolvedValue({
      ok: true,
      found: true,
      contactId: 'contact',
    });
    service = new WhatsAppHarnessService(
      new ConfigService({ WHATSAPP_HARNESS_ENABLED: 'true' }),
      repository as unknown as WhatsAppHarnessRepository,
      integrations as unknown as OrganizationIntegrationsService,
      organizations as unknown as OrganizationsService,
      profiles as unknown as ToolProfilesService,
      booking as unknown as WhatsAppBookingService,
      meta as unknown as MetaWhatsAppClient,
    );
  });
  it('stores only eligible org texts and never calls a model or sends during ingest', async () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '12345678' },
                messages: [
                  {
                    id: 'message',
                    from: conversation.sender,
                    type: 'text',
                    text: { body: 'Hello' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await service.ingestWebhook(payload);
    expect(repository.ingest).toHaveBeenCalledWith({
      organizationId: 'org',
      connectionId: 'connection',
      sender: conversation.sender,
      phoneNumberId: '12345678',
      messageId: 'message',
      body: 'Hello',
    });
    expect(meta.sendText).not.toHaveBeenCalled();
    organizations.findById.mockResolvedValue({ id: 'org', isActive: false });
    repository.ingest.mockClear();
    await service.ingestWebhook(payload);
    expect(repository.ingest).not.toHaveBeenCalled();
  });
  it('rechecks the assigned tool allowlist and binds sender identity on the server', async () => {
    await service.executeTool('turn', 'lease', 'lookupGhlContact', {
      email: 'user@company.com',
    });
    expect(booking.lookupContact).toHaveBeenCalledWith(
      { organizationId: 'org', voiceAgentId: 'voice' },
      { email: 'user@company.com', phone: conversation.sender },
    );
    expect(
      await service.executeTool('turn', 'lease', 'lookupGhlContact', {
        phone: 'another-customer',
      }),
    ).toEqual({ ok: false, error: 'invalid_arguments' });
    profiles.resolveEnabledToolIds.mockResolvedValue(['endCall']);
    await expect(
      service.executeTool('turn', 'lease', 'lookupGhlContact', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(booking.lookupContact).toHaveBeenCalledTimes(1);
  });
  it('keeps a timeout uncertain and never exposes the Meta token in the send result', async () => {
    const outbox = {
      id: 'outbox',
      body: 'Reply',
      status: 'sending',
      attemptCount: 1,
    };
    const manager = { save: jest.fn() };
    repository.reserveSend.mockResolvedValue(outbox);
    repository.withSend.mockImplementation((_id, action) =>
      action(outbox, conversation, manager),
    );
    meta.sendText.mockResolvedValue({
      ok: false,
      status: 0,
      message: 'network',
    });
    expect(await service.sendOne()).toBe(true);
    expect(outbox.status).toBe('uncertain');
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'send_outcome_unknown' }),
    );
    expect(JSON.stringify(outbox)).not.toContain('org-secret');
  });

  it('books the checked absolute slot and duration, not model timezone or end-time guesses', async () => {
    conversation.toolState = {
      contactId: 'contact',
      offeredSlots: ['2027-01-10T10:00:00Z'],
      offeredSlotEnds: { '2027-01-10T10:00:00Z': '2027-01-10T10:30:00Z' },
    };
    profiles.resolveEnabledToolIds.mockResolvedValue(['scheduleGhlMeeting']);
    booking.scheduleMeeting.mockResolvedValue({
      ok: true,
      appointmentId: 'appointment',
    });
    await service.executeTool('turn', 'lease', 'scheduleGhlMeeting', {
      startTime: '2027-01-10T10:00:00Z',
      endTime: '2027-01-10T23:30:00Z',
      timezone: 'Asia/Kolkata',
    });
    expect(booking.scheduleMeeting).toHaveBeenCalledWith(
      { organizationId: 'org', voiceAgentId: 'voice' },
      {
        contactId: 'contact',
        startTime: '2027-01-10T10:00:00.000+00:00',
        endTime: '2027-01-10T10:30:00.000+00:00',
        title: undefined,
        description: undefined,
      },
    );
    booking.scheduleMeeting.mockResolvedValue({
      ok: false,
      error: 'network_error',
    });
    repository.finishTool.mockClear();
    expect(
      await service.executeTool('turn', 'lease', 'scheduleGhlMeeting', {
        startTime: '2027-01-10T10:00:00Z',
      }),
    ).toEqual(expect.objectContaining({ error: 'operation_outcome_unknown' }));
    expect(repository.finishTool).not.toHaveBeenCalled();
  });

  it('strips reasoning from checkpoint and completion callbacks', async () => {
    const input = {
      session: {
        state: {},
        events: [
          {
            content: {
              parts: [{ text: 'Hidden', thought: true }, { text: 'Visible' }],
            },
          },
        ],
      },
      reply: 'Visible',
    };
    await service.checkpoint('turn', 'lease', input);
    await service.complete('turn', 'lease', input);
    for (const method of [repository.checkpoint, repository.complete]) {
      expect(JSON.stringify(method.mock.calls)).not.toContain('Hidden');
      expect(JSON.stringify(method.mock.calls)).toContain('Visible');
    }
  });
});
