import { BadRequestException, ConflictException, HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { HumanCallToolId, HumanCallWorkspaceActionRequest, UpdateHumanCallWorkspace } from '@call-agent/contracts';
import type { AuthOrgUser } from '../../auth/auth.types';
import { CrmService } from '../../crm/crm.service';
import { HumanCallSessionsRepository } from '../human-call-sessions.repository';
import type { HumanCallSession } from '../human-call-session.entity';
import { humanCallWorkspace } from '../lib/human-call-workspace';

const meetingSchema = z.object({
  calendarId: z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string().trim().min(1).max(255),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
  timezone: z.string().min(1).max(100).refine((value) => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
  }, 'Invalid timezone'),
}).strict().refine((m) => Date.parse(m.endTime) > Date.parse(m.startTime), 'End must be after start');

@Injectable()
export class HumanCallWorkspaceService {
  constructor(private readonly sessions: HumanCallSessionsRepository, private readonly crm: CrmService) {}

  async get(actor: AuthOrgUser, callId: string) {
    return humanCallWorkspace(await this.sessions.owned(callId, actor));
  }
  private tool(session: HumanCallSession, tool: HumanCallToolId) {
    if (!(session.selection.selectedTools ?? []).includes(tool))
      throw new BadRequestException('This tool was not selected for this call');
  }
  private revision(session: HumanCallSession, revision: number) {
    if ((session.workspace.revision ?? 0) !== revision)
      throw new ConflictException('Workspace changed. Refresh saved results before trying again; your draft is retained.');
  }
  private touch(session: HumanCallSession, actor: AuthOrgUser) {
    session.workspace.revision = (session.workspace.revision ?? 0) + 1;
    session.workspace.updatedAt = new Date().toISOString();
    session.workspace.updatedBy = actor.id;
  }
  async update(actor: AuthOrgUser, callId: string, input: UpdateHumanCallWorkspace) {
    return this.sessions.mutateWorkspace(callId, actor, (session) => {
      this.revision(session, input.revision);
      if (input.interest !== undefined) { this.tool(session, 'interest'); session.workspace.interest = input.interest; }
      if (input.notes !== undefined) { this.tool(session, 'notes'); session.workspace.notes = input.notes; }
      this.touch(session, actor);
      return humanCallWorkspace(session);
    });
  }
  async execute(actor: AuthOrgUser, callId: string, input: HumanCallWorkspaceActionRequest) {
    const owned = await this.sessions.owned(callId, actor);
    const parsed = input.kind === 'bookMeeting' ? meetingSchema.safeParse(input.meeting) : null;
    if (parsed && !parsed.success) throw new BadRequestException('A valid calendar, title, start, end and timezone are required');
    if (input.kind === 'publishSummary' && input.meeting !== undefined)
      throw new BadRequestException('Summary cannot contain meeting parameters');
    const meeting = parsed?.success ? parsed.data : undefined;
    const fingerprint = createHash('sha256').update(JSON.stringify({ kind: input.kind, revision: input.revision, meeting })).digest('hex');
    const claim = await this.sessions.mutateWorkspace(callId, actor, (session) => {
      const actions = session.workspace.actions ??= [];
      const existing = actions.find((a) => a.requestId === input.requestId);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new ConflictException('Request ID is already used for a different action');
        return { replay: true as const, workspace: humanCallWorkspace(session) };
      }
      this.revision(session, input.revision);
      if (input.kind === 'bookMeeting') {
        this.tool(session, 'bookMeeting');
        if (Date.parse(meeting!.startTime) <= Date.now()) throw new BadRequestException('Meeting must start in the future');
      } else {
        if (!(session.selection.selectedTools ?? []).some((t) => t === 'interest' || t === 'notes'))
          throw new BadRequestException('Select Interest or Notes to publish a summary');
        if (!session.workspace.interest && !session.workspace.notes?.trim())
          throw new BadRequestException('Save interest or notes before publishing a summary');
      }
      if (!session.crmIntegrationId) throw new BadRequestException('CRM connection is no longer available');
      if (actions.length >= 100) throw new ConflictException('This call has reached its external action limit');
      // Do not allow a new request ID to bypass an unresolved external write.
      if (actions.some((a) => a.kind === input.kind && ['pending', 'uncertain'].includes(a.status)))
        throw new ConflictException('Check the uncertain result in CRM before performing this action again');
      actions.push({ requestId: input.requestId, kind: input.kind, fingerprint,
        status: 'pending', createdAt: new Date().toISOString(), completedAt: null,
        providerId: null, message: null, ...(meeting ? { meeting } : {}) });
      this.touch(session, actor);
      const interest = session.workspace.interest === 'interested' ? 'Interested' : session.workspace.interest === 'not_interested' ? 'Not interested' : 'Unset';
      return { replay: false as const, integrationId: session.crmIntegrationId,
        contactId: session.crmContactId,
        summary: `Speeko call ${callId}\nCaller: ${session.callerName}\nCall time: ${owned.call.createdAt.toISOString()}\nInterest: ${interest}\n\n${session.workspace.notes ?? ''}` };
    });
    if (claim.replay) return claim.workspace;
    let providerId: string | null = null;
    let status: 'succeeded' | 'failed' | 'uncertain' = 'uncertain';
    let message = 'Result is uncertain. Inspect the contact’s CRM notes or calendar before taking further action.';
    try {
      const result = await this.crm.execute(actor.orgId, claim.integrationId, input.kind === 'bookMeeting'
        ? { action: 'events.create', params: { data: { calendarId: meeting!.calendarId,
          contactId: claim.contactId, title: meeting!.title, startTime: meeting!.startTime,
          endTime: meeting!.endTime, appointmentStatus: 'confirmed' } } }
        : { action: 'notes.create', params: { contactId: claim.contactId, data: { body: claim.summary } } });
      const receipt = (result.event ?? result.appointment ?? result.note ?? result) as Record<string, unknown>;
      if (typeof receipt.id === 'string' && receipt.id.length > 0) {
        providerId = receipt.id;
        status = 'succeeded';
        message = input.kind === 'bookMeeting' ? 'Meeting booked in HighLevel.' : 'Summary copied to HighLevel.';
      }
    } catch (error) {
      // Provider writes are never retried. Do not leak raw provider errors or credentials.
      if (error instanceof HttpException && [400, 403, 404, 409, 422, 429].includes(error.getStatus())) {
        status = 'failed';
        message = error.message;
      }
    }
    return this.sessions.mutateWorkspace(callId, actor, (session) => {
      const action = session.workspace.actions!.find((a) => a.requestId === input.requestId)!;
      action.status = status;
      action.providerId = providerId;
      action.completedAt = new Date().toISOString();
      action.message = message;
      this.touch(session, actor);
      return humanCallWorkspace(session);
    });
  }

  async resolve(actor: AuthOrgUser, callId: string, requestId: string, resolution: 'not_found' | 'found', providerId?: string) {
    const session = await this.sessions.owned(callId, actor);
    const action = humanCallWorkspace(session).actions.find((a) => a.requestId === requestId);
    if (!action || !['pending', 'uncertain'].includes(action.status))
      throw new ConflictException('Only an unresolved action can be reconciled');
    if (action.status === 'pending') throw new ConflictException('Wait one minute for the original request before reconciling');
    if (resolution === 'found') {
      if (!providerId || !session.crmIntegrationId) throw new BadRequestException('CRM record ID is required');
      const result = await this.crm.execute(actor.orgId, session.crmIntegrationId, action.kind === 'bookMeeting'
        ? { action: 'events.list', params: { calendarId: action.meeting!.calendarId,
          startTime: action.meeting!.startTime, endTime: action.meeting!.endTime } }
        : { action: 'notes.list', params: { contactId: session.crmContactId } });
      const records = result[action.kind === 'bookMeeting' ? 'events' : 'notes'];
      if (!Array.isArray(records) || !records.some((row) => row?.id === providerId &&
        (action.kind !== 'bookMeeting' || row.contactId === session.crmContactId)))
        throw new BadRequestException('CRM record was not found for this contact and action');
    }
    return this.sessions.mutateWorkspace(callId, actor, (current) => {
      const stored = current.workspace.actions?.find((a) => a.requestId === requestId);
      if (!stored || !['pending', 'uncertain'].includes(stored.status)) throw new ConflictException('Action has already been resolved');
      stored.status = resolution === 'found' ? 'succeeded' : 'failed';
      stored.providerId = resolution === 'found' ? providerId! : null;
      stored.completedAt = new Date().toISOString();
      stored.message = resolution === 'found' ? 'CRM receipt verified by caller.' : 'Caller inspected CRM and confirmed no record was created.';
      this.touch(current, actor);
      return humanCallWorkspace(current);
    });
  }
}
