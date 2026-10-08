import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import type { HumanCallWorkspaceActionRequest } from '@call-agent/contracts';
import { HumanCallWorkspaceService } from '../services/human-call-workspace.service';
import { HumanCallSession } from '../human-call-session.entity';
import { humanCallWorkspace } from '../lib/human-call-workspace';
import { CreateHumanCallDto } from '../dto/human-call.dto';
import { UpdateHumanCallWorkspaceDto } from '../dto/human-call-workspace.dto';

const actor = { typ: 'user' as const, id: randomUUID(), orgId: randomUUID(), name: 'Caller', email: 'caller@example.test', role: 'agent' };
const meeting = () => ({ calendarId: 'calendar', title: 'Discovery', startTime: new Date(Date.now() + 86400000).toISOString(),
  endTime: new Date(Date.now() + 88200000).toISOString(), timezone: 'Asia/Calcutta' });
function harness() {
  const session = { callId: randomUUID(), userId: actor.id, organizationId: actor.orgId, callerName: actor.name,
    crmIntegrationId: randomUUID(), crmContactId: 'contact', finishedAt: new Date(), joinDeadline: new Date(),
    selection: { selectedTools: ['interest', 'notes', 'bookMeeting'] }, workspace: {},
    call: { createdAt: new Date('2026-10-08T00:00:00Z') } } as HumanCallSession;
  const owned = jest.fn(async (_id, input) => {
    if (input.id !== session.userId || input.orgId !== session.organizationId) throw new NotFoundException();
    return session;
  });
  const sessions = { owned, mutateWorkspace: jest.fn(async (id, input, mutate) => {
    await owned(id, input);
    return mutate(session);
  }) };
  const crm = { execute: jest.fn().mockResolvedValue({ event: { id: 'appointment' } }) };
  const service = new HumanCallWorkspaceService(sessions as never, crm as never);
  const action = (kind: 'bookMeeting' | 'publishSummary' = 'bookMeeting'): HumanCallWorkspaceActionRequest => ({
    requestId: randomUUID(), revision: session.workspace.revision ?? 0, kind, ...(kind === 'bookMeeting' ? { meeting: meeting() } : {}),
  });
  return { session, sessions, crm, service, action };
}

describe('Human call workspace', () => {
  it('keeps results after hang-up and rejects stale revisions without provider calls', async () => {
    const h = harness();
    const result = await h.service.update(actor, h.session.callId, { revision: 0, interest: 'interested', notes: 'Discussed pricing' });
    expect(result).toMatchObject({ revision: 1, interest: 'interested', notes: 'Discussed pricing', updatedBy: actor.id });
    await expect(h.service.update(actor, h.session.callId, { revision: 0, notes: 'stale' })).rejects.toThrow(ConflictException);
    expect(h.session.workspace.notes).toBe('Discussed pricing'); expect(h.crm.execute).not.toHaveBeenCalled();
  });
  it('enforces caller and tenant ownership for reads, saves and external actions', async () => {
    const h = harness();
    for (const stranger of [{ ...actor, id: randomUUID() }, { ...actor, orgId: randomUUID() }]) {
      await expect(h.service.get(stranger, h.session.callId)).rejects.toThrow(NotFoundException);
      await expect(h.service.update(stranger, h.session.callId, { revision: 0, notes: 'x' })).rejects.toThrow(NotFoundException);
      await expect(h.service.execute(stranger, h.session.callId, h.action())).rejects.toThrow(NotFoundException);
    }
    expect(h.crm.execute).not.toHaveBeenCalled();
  });
  it('rejects deselected tools and empty CRM summaries', async () => {
    const h = harness(); h.session.selection.selectedTools = [];
    await expect(h.service.update(actor, h.session.callId, { revision: 0, notes: 'x' })).rejects.toThrow(BadRequestException);
    await expect(h.service.update(actor, h.session.callId, { revision: 0, interest: 'interested' })).rejects.toThrow(BadRequestException);
    await expect(h.service.execute(actor, h.session.callId, h.action())).rejects.toThrow(BadRequestException);
    h.session.selection.selectedTools = ['notes'];
    await expect(h.service.execute(actor, h.session.callId, h.action('publishSummary'))).rejects.toThrow(BadRequestException);
    expect(h.crm.execute).not.toHaveBeenCalled();
  });
  it('fixes the contact and connection from the session and persists only the provider receipt', async () => {
    const h = harness(), input = h.action();
    const result = await h.service.execute(actor, h.session.callId, input);
    expect(h.crm.execute).toHaveBeenCalledWith(actor.orgId, h.session.crmIntegrationId, {
      action: 'events.create', params: { data: expect.objectContaining({ contactId: 'contact', calendarId: 'calendar', appointmentStatus: 'confirmed' }) },
    });
    expect(result.actions[0]).toMatchObject({ status: 'succeeded', providerId: 'appointment', meeting: input.meeting });
    expect(JSON.stringify(result)).not.toContain('fingerprint');
  });
  it('replays identical requests without another provider write, and rejects changed payloads', async () => {
    const h = harness(), input = h.action();
    await h.service.execute(actor, h.session.callId, input);
    await h.service.execute(actor, h.session.callId, input);
    await expect(h.service.execute(actor, h.session.callId, { ...input, meeting: { ...input.meeting!, title: 'Different' } })).rejects.toThrow(ConflictException);
    expect(h.crm.execute).toHaveBeenCalledTimes(1);
  });
  it('prevents simultaneous requests, including requests with different IDs, from double booking', async () => {
    const h = harness(); let finish!: (value: unknown) => void;
    h.crm.execute.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const input = h.action();
    const first = h.service.execute(actor, h.session.callId, input);
    while (!finish) await Promise.resolve();
    const duplicate = await h.service.execute(actor, h.session.callId, input);
    expect(duplicate.actions[0].status).toBe('pending');
    await expect(h.service.execute(actor, h.session.callId, h.action())).rejects.toThrow(ConflictException);
    finish({ appointment: { id: 'receipt' } }); await first;
    expect(h.crm.execute).toHaveBeenCalledTimes(1);
  });
  it('keeps uncertain writes blocked until the caller explicitly inspects CRM', async () => {
    const h = harness(), input = h.action(); h.crm.execute.mockRejectedValue(new Error('secret-provider-details'));
    const result = await h.service.execute(actor, h.session.callId, input);
    expect(result.actions[0].status).toBe('uncertain'); expect(JSON.stringify(result)).not.toContain('secret-provider-details');
    await expect(h.service.execute(actor, h.session.callId, h.action())).rejects.toThrow(ConflictException);
    await h.service.resolve(actor, h.session.callId, input.requestId, 'not_found');
    h.crm.execute.mockResolvedValue({ event: { id: 'second' } });
    expect((await h.service.execute(actor, h.session.callId, h.action())).actions[1].status).toBe('succeeded');
  });
  it('verifies reconciled receipts belong to the called contact', async () => {
    const h = harness(), input = h.action(); h.crm.execute.mockRejectedValueOnce(new Error('timeout'));
    await h.service.execute(actor, h.session.callId, input);
    h.crm.execute.mockResolvedValueOnce({ events: [{ id: 'receipt', contactId: 'other' }] });
    await expect(h.service.resolve(actor, h.session.callId, input.requestId, 'found', 'receipt')).rejects.toThrow(BadRequestException);
    h.crm.execute.mockResolvedValueOnce({ events: [{ id: 'receipt', contactId: 'contact' }] });
    expect((await h.service.resolve(actor, h.session.callId, input.requestId, 'found', 'receipt')).actions[0].status).toBe('succeeded');
  });
  it('marks known permission failures as failed with the sanitized scope message', async () => {
    const h = harness(); h.crm.execute.mockRejectedValue(new ForbiddenException('Requires calendars/events.write'));
    const result = await h.service.execute(actor, h.session.callId, h.action());
    expect(result.actions[0]).toMatchObject({ status: 'failed', message: 'Requires calendars/events.write' });
  });
  it('does not claim success from a response without a persisted record ID', async () => {
    const h = harness(); h.crm.execute.mockResolvedValue({ success: true });
    expect((await h.service.execute(actor, h.session.callId, h.action())).actions[0].status).toBe('uncertain');
  });
  it('publishes saved notes and interest only with an explicit summary action', async () => {
    const h = harness();
    await h.service.update(actor, h.session.callId, { revision: 0, notes: 'Customer requested a demo', interest: 'interested' });
    expect(h.crm.execute).not.toHaveBeenCalled();
    h.crm.execute.mockResolvedValue({ note: { id: 'note-id' } });
    await h.service.execute(actor, h.session.callId, h.action('publishSummary'));
    expect(h.crm.execute).toHaveBeenCalledWith(actor.orgId, h.session.crmIntegrationId, {
      action: 'notes.create', params: { contactId: 'contact', data: { body: expect.stringContaining('Interest: Interested\n\nCustomer requested a demo') } },
    });
  });
  it.each(['wrong timezone', 'end before start', 'foreign contact', 'past time'])('rejects invalid booking input: %s', async (scenario) => {
    const h = harness(), input = h.action();
    if (scenario === 'wrong timezone') input.meeting!.timezone = 'Not/AZone';
    if (scenario === 'end before start') input.meeting!.endTime = new Date(0).toISOString();
    if (scenario === 'foreign contact') (input.meeting as any).contactId = 'other';
    if (scenario === 'past time') input.meeting!.startTime = new Date(0).toISOString();
    await expect(h.service.execute(actor, h.session.callId, input)).rejects.toThrow(BadRequestException);
    expect(h.crm.execute).not.toHaveBeenCalled();
  });
  it('renders abandoned pending actions as uncertain and never exposes private journal data', () => {
    const h = harness(); h.session.workspace.actions = [{ requestId: randomUUID(), kind: 'publishSummary', status: 'pending', createdAt: new Date(Date.now() - 61000).toISOString(), completedAt: null, providerId: null, message: null, fingerprint: 'private' }];
    expect(humanCallWorkspace(h.session).actions[0].status).toBe('uncertain');
    expect(JSON.stringify(humanCallWorkspace(h.session))).not.toContain('private');
  });
  it('validates selected tool IDs and note limits, while accepting older callers', async () => {
    const base = { crmIntegrationId: randomUUID(), crmContactId: 'contact', sipTrunkId: randomUUID(), requestId: randomUUID() };
    expect(await validate(plainToInstance(CreateHumanCallDto, base))).toHaveLength(0);
    for (const selectedTools of [['unknown'], ['notes', 'notes']]) expect((await validate(plainToInstance(CreateHumanCallDto, { ...base, selectedTools }))).length).toBeGreaterThan(0);
    for (const notes of [null, 'x'.repeat(4001)]) expect((await validate(plainToInstance(UpdateHumanCallWorkspaceDto, { revision: 0, notes }))).length).toBeGreaterThan(0);
  });
});
