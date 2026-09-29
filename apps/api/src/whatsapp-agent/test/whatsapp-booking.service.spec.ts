import type { OrganizationAgentsService } from '../../agents/organization-agents.service';
import type { GhlService } from '../../ghl/ghl.service';
import { IntegrationProvider } from '../../organization-integrations/organization-integration.entity';
import type { OrganizationIntegrationsService } from '../../organization-integrations/organization-integrations.service';
import { WhatsAppBookingService } from '../whatsapp-booking.service';

describe('WhatsAppBookingService', () => {
  const source = { organizationId: 'org-1', voiceAgentId: 'agent-1' };
  const creds = {
    token: 'existing-pit',
    locationId: 'location-1',
    calendarId: 'calendar-1',
  };
  const agents = { getEntityWithTemplate: jest.fn() };
  const integrations = { getEntityForOrg: jest.fn() };
  const ghl = {
    upsertContact: jest.fn(),
    getFreeSlots: jest.fn(),
    createAppointment: jest.fn(),
  };
  const service = new WhatsAppBookingService(
    agents as unknown as OrganizationAgentsService,
    integrations as unknown as OrganizationIntegrationsService,
    ghl as unknown as GhlService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    agents.getEntityWithTemplate.mockResolvedValue({
      isActive: true,
      calendarIntegrationId: 'integration-1',
    });
    integrations.getEntityForOrg.mockResolvedValue({
      provider: IntegrationProvider.GHL,
      isActive: true,
      apiKey: creds.token,
      locationId: creds.locationId,
      calendarId: creds.calendarId,
    });
  });

  it('uses the selected voice agent calendar credentials for contact, slots, and booking', async () => {
    ghl.upsertContact.mockResolvedValue({
      ok: true,
      contactId: 'contact-1',
      created: true,
    });
    ghl.getFreeSlots.mockResolvedValue({
      ok: true,
      slotMinutes: 30,
      slots: [
        { startIso: '2030-01-01T10:00:00Z', endIso: '2030-01-01T10:30:00Z' },
      ],
    });
    ghl.createAppointment.mockResolvedValue({
      ok: true,
      appointmentId: 'meeting-1',
      startTime: '2030-01-01T10:00:00Z',
    });

    await service.upsertContact(source, { phone: '+15550102000' });
    await service.freeSlots(source, {
      startTime: '2030-01-01T09:00:00Z',
      endTime: '2030-01-01T17:00:00Z',
    });
    await service.scheduleMeeting(source, {
      contactId: 'contact-1',
      startTime: '2030-01-01T10:00:00Z',
    });

    expect(agents.getEntityWithTemplate).toHaveBeenCalledWith(
      'org-1',
      'agent-1',
    );
    expect(integrations.getEntityForOrg).toHaveBeenCalledWith(
      'org-1',
      'integration-1',
    );
    expect(ghl.upsertContact).toHaveBeenCalledWith(
      { phone: '+15550102000' },
      { token: creds.token, locationId: creds.locationId },
    );
    expect(ghl.getFreeSlots).toHaveBeenCalledWith(expect.any(Object), creds);
    expect(ghl.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 'contact-1' }),
      creds,
    );
  });

  it('does not use a disconnected or non-GHL calendar', async () => {
    integrations.getEntityForOrg.mockResolvedValue({
      provider: IntegrationProvider.NYLAS,
      isActive: true,
    });
    await expect(
      service.upsertContact(source, { phone: '+15550102000' }),
    ).resolves.toMatchObject({ ok: false, error: 'calendar_unavailable' });
    expect(ghl.upsertContact).not.toHaveBeenCalled();
  });
});
