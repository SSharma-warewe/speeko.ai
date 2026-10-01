import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CrmCommand } from '@call-agent/contracts';
import { CrmService } from '../crm.service';
import { GhlService } from '../../ghl/ghl.service';
import { OrganizationIntegrationsService } from '../../organization-integrations/organization-integrations.service';

describe('live CRM authorization and operations', () => {
  const row = {
    id: 'integration-1',
    organizationId: 'org-1',
    provider: 'ghl_crm',
    isActive: true,
    apiKey: 'pit-tenant-secret',
    locationId: 'location1',
  };
  let integrations: { getEntityForOrg: jest.Mock };
  let ghl: { crmRequest: jest.Mock };
  let service: CrmService;
  const execute = (
    action: CrmCommand['action'],
    params: Record<string, unknown> = {},
  ) => service.execute('org-1', row.id, { action, params });
  beforeEach(() => {
    integrations = { getEntityForOrg: jest.fn().mockResolvedValue({ ...row }) };
    ghl = { crmRequest: jest.fn().mockResolvedValue({}) };
    service = new CrmService(
      integrations as unknown as OrganizationIntegrationsService,
      ghl as unknown as GhlService,
    );
  });
  it.each([
    { isActive: false },
    { organizationId: 'other-org' },
    { provider: 'ghl' },
    { locationId: null },
    { apiKey: ' ' },
  ])(
    'rejects invalid connection %j without reaching HighLevel',
    async (change) => {
      integrations.getEntityForOrg.mockResolvedValue({ ...row, ...change });
      await expect(execute('contacts.list')).rejects.toThrow(NotFoundException);
      expect(ghl.crmRequest).not.toHaveBeenCalled();
    },
  );
  it('always resolves credentials with the JWT organization', async () => {
    await execute('contacts.list', { query: 'Ada & Co', limit: 20 });
    expect(integrations.getEntityForOrg).toHaveBeenCalledWith('org-1', row.id);
    expect(ghl.crmRequest).toHaveBeenCalledWith(
      { token: row.apiKey, locationId: row.locationId },
      'GET',
      '/contacts/?locationId=location1&limit=20&query=Ada+%26+Co',
      undefined,
    );
  });
  it.each([
    { action: 'contacts.list', params: { locationId: 'foreign-location' } },
    { action: 'contacts.list', params: { limit: 101 } },
    { action: 'contacts.update', params: { id: '../other', data: {} } },
    {
      action: 'contacts.create',
      params: { data: { email: 'ada@example.com', locationId: 'foreign' } },
    },
    { action: 'contacts.create', params: { data: { firstName: 'Ada' } } },
    { action: 'contacts.delete', params: { id: 'https://evil.test' } },
    { action: 'constructor' },
    { action: 'fetch.anything', params: { url: 'https://evil.test' } },
  ])('strictly rejects unsupported actions/parameters %j', async (command) => {
    await expect(
      service.execute('org-1', row.id, command as CrmCommand),
    ).rejects.toThrow(BadRequestException);
    expect(ghl.crmRequest).not.toHaveBeenCalled();
  });
  it('creates contacts only in the saved location', async () => {
    await execute('contacts.create', {
      data: { email: 'ada@example.com', firstName: 'Ada' },
    });
    expect(ghl.crmRequest).toHaveBeenCalledWith(
      { token: row.apiKey, locationId: row.locationId },
      'POST',
      '/contacts/',
      {
        email: 'ada@example.com',
        firstName: 'Ada',
        locationId: 'location1',
        source: 'Speeko CRM',
      },
    );
  });
  it.each(['contacts.get', 'contacts.update', 'contacts.delete'] as const)(
    'rejects foreign location for %s',
    async (action) => {
      ghl.crmRequest.mockResolvedValue({
        contact: { id: 'contact1', locationId: 'foreign' },
      });
      await expect(
        execute(action, {
          id: 'contact1',
          ...(action === 'contacts.update'
            ? { data: { firstName: 'Ada' } }
            : {}),
        }),
      ).rejects.toThrow(NotFoundException);
      expect(ghl.crmRequest).toHaveBeenCalledTimes(1);
    },
  );
  it('never edits a note belonging to another contact', async () => {
    ghl.crmRequest
      .mockResolvedValueOnce({
        contact: { id: 'contact1', locationId: 'location1' },
      })
      .mockResolvedValueOnce({ notes: [{ id: 'note1' }] });
    await expect(
      execute('notes.update', {
        contactId: 'contact1',
        id: 'foreign-note',
        data: { body: 'changed' },
      }),
    ).rejects.toThrow(NotFoundException);
    expect(ghl.crmRequest).toHaveBeenCalledTimes(2);
  });
  it('updates a task under a checked contact', async () => {
    ghl.crmRequest
      .mockResolvedValueOnce({ contact: { locationId: 'location1' } })
      .mockResolvedValueOnce({ tasks: [{ id: 'task1' }] })
      .mockResolvedValueOnce({ task: { id: 'task1', completed: true } });
    const data = {
      title: 'Call Ada',
      dueDate: '2026-10-02T10:00:00+05:30',
      completed: true,
    };
    await execute('tasks.update', { contactId: 'contact1', id: 'task1', data });
    expect(ghl.crmRequest).toHaveBeenLastCalledWith(
      { token: row.apiKey, locationId: row.locationId },
      'PUT',
      '/contacts/contact1/tasks/task1',
      data,
    );
  });
  it('checks both contact and calendar before booking and keeps slot validation enabled', async () => {
    ghl.crmRequest
      .mockResolvedValueOnce({ contact: { locationId: 'location1' } })
      .mockResolvedValueOnce({ calendars: [{ id: 'calendar1' }] })
      .mockResolvedValueOnce({ id: 'appointment1' });
    const data = {
      calendarId: 'calendar1',
      contactId: 'contact1',
      title: 'Consultation',
      startTime: '2026-10-02T10:00:00+05:30',
      endTime: '2026-10-02T10:30:00+05:30',
    };
    await execute('events.create', { data });
    expect(ghl.crmRequest).toHaveBeenLastCalledWith(
      { token: row.apiKey, locationId: row.locationId },
      'POST',
      '/calendars/events/appointments',
      expect.objectContaining({
        locationId: 'location1',
        toNotify: true,
        ignoreFreeSlotValidation: false,
      }),
    );
  });
  it('rejects a calendar from another location', async () => {
    ghl.crmRequest.mockResolvedValue({ calendars: [{ id: 'calendar1' }] });
    await expect(
      execute('events.list', {
        calendarId: 'foreign',
        startTime: '2026-10-01T00:00:00Z',
        endTime: '2026-10-02T00:00:00Z',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(ghl.crmRequest).toHaveBeenCalledTimes(1);
  });
  it.each(['events.update', 'events.delete'] as const)(
    'rejects foreign appointment for %s',
    async (action) => {
      ghl.crmRequest.mockResolvedValue({ locationId: 'foreign', id: 'event1' });
      await expect(
        execute(action, {
          id: 'event1',
          ...(action === 'events.update'
            ? { data: { appointmentStatus: 'cancelled' } }
            : {}),
        }),
      ).rejects.toThrow(NotFoundException);
      expect(ghl.crmRequest).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects rescheduling a start beyond the existing end', async () => {
    ghl.crmRequest.mockResolvedValue({
      locationId: 'location1',
      startTime: '2026-10-02T10:00:00Z',
      endTime: '2026-10-02T10:30:00Z',
    });
    await expect(
      execute('events.update', {
        id: 'event1',
        data: { startTime: '2026-10-02T11:00:00Z' },
      }),
    ).rejects.toThrow(BadRequestException);
  });
  it('uses current opportunity paths and camelCase location filters', async () => {
    await execute('opportunities.list', { pipelineId: 'pipeline1' });
    expect(ghl.crmRequest).toHaveBeenCalledWith(
      { token: row.apiKey, locationId: row.locationId },
      'GET',
      '/v3/opportunities/search?locationId=location1&limit=50&page=1&pipelineId=pipeline1',
      undefined,
      'v3',
    );
  });
  it('cannot move an opportunity to a foreign pipeline stage', async () => {
    ghl.crmRequest
      .mockResolvedValueOnce({
        opportunity: { locationId: 'location1', pipelineId: 'pipeline1' },
      })
      .mockResolvedValueOnce({
        pipelines: [{ id: 'pipeline1', stages: [{ id: 'stage1' }] }],
      });
    await expect(
      execute('opportunities.update', {
        id: 'deal1',
        data: { pipelineStageId: 'foreign-stage' },
      }),
    ).rejects.toThrow(NotFoundException);
    expect(ghl.crmRequest).toHaveBeenCalledTimes(2);
  });
  it('checks location before exposing conversation messages', async () => {
    ghl.crmRequest.mockResolvedValue({ locationId: 'foreign' });
    await expect(
      execute('messages.list', { id: 'conversation1' }),
    ).rejects.toThrow(NotFoundException);
    expect(ghl.crmRequest).toHaveBeenCalledTimes(1);
  });
  it.each([{ dnd: true }, { dndSettings: { SMS: { status: 'active' } } }])(
    'honors DND %j before sending',
    async (dnd) => {
      ghl.crmRequest.mockResolvedValue({
        contact: { locationId: 'location1', ...dnd },
      });
      await expect(
        execute('messages.send', {
          contactId: 'contact1',
          data: { type: 'SMS', message: 'Hello' },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(ghl.crmRequest).toHaveBeenCalledTimes(1);
    },
  );
  it('checks workflow membership in the saved location before enrollment', async () => {
    ghl.crmRequest
      .mockResolvedValueOnce({ contact: { locationId: 'location1' } })
      .mockResolvedValueOnce({ workflows: [{ id: 'workflow1' }] });
    await expect(
      execute('workflows.enroll', {
        contactId: 'contact1',
        id: 'foreign-workflow',
      }),
    ).rejects.toThrow(NotFoundException);
  });
  it('returns a bounded contact cursor without following remote nextPageUrl', async () => {
    ghl.crmRequest.mockResolvedValue({
      contacts: [{ id: 'c1' }],
      meta: {
        startAfterId: 'c1',
        startAfter: 42,
        nextPageUrl: 'https://evil.test',
      },
    });
    const first = await execute('contacts.list', { limit: 1 });
    expect(typeof first.nextCursor).toBe('string');
    await execute('contacts.list', { limit: 1, cursor: first.nextCursor });
    expect(ghl.crmRequest).toHaveBeenLastCalledWith(
      { token: row.apiKey, locationId: row.locationId },
      'GET',
      '/contacts/?locationId=location1&limit=1&startAfterId=c1&startAfter=42',
      undefined,
    );
    await expect(
      execute('contacts.list', { cursor: 'invalid-cursor' }),
    ).rejects.toThrow(BadRequestException);
  });
  it('allows one feature when another is permission denied', async () => {
    ghl.crmRequest
      .mockRejectedValueOnce(new Error('calendar denied'))
      .mockResolvedValueOnce({ contacts: [{ id: 'c1' }] });
    await expect(execute('calendars.list')).rejects.toThrow('calendar denied');
    await expect(execute('contacts.list')).resolves.toMatchObject({
      contacts: [{ id: 'c1' }],
    });
  });
});
