import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IntegrationProvider,
  type CrmCommand,
  type CrmResult,
} from '@call-agent/contracts';
import { GhlService } from '../ghl/ghl.service';
import { OrganizationIntegrationsService } from '../organization-integrations/organization-integrations.service';
import { CRM_SCHEMAS } from './crm.schemas';

type Json = Record<string, unknown>;
const object = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : {};
const items = (value: unknown): Json[] =>
  Array.isArray(value) ? value.map(object) : [];
const resource = (response: Json, key: string): Json =>
  Object.keys(object(response[key])).length ? object(response[key]) : response;

@Injectable()
export class CrmService {
  constructor(
    private readonly integrations: OrganizationIntegrationsService,
    private readonly ghl: GhlService,
  ) {}

  async execute(
    orgId: string,
    integrationId: string,
    command: CrmCommand,
  ): Promise<CrmResult> {
    const schema = Object.hasOwn(CRM_SCHEMAS, command.action)
      ? CRM_SCHEMAS[command.action]
      : undefined;
    if (!schema) throw new BadRequestException('Unsupported CRM action');
    const parsed = schema.safeParse(command.params ?? {});
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues
          .map(
            (issue) => `${issue.path.join('.') || 'params'}: ${issue.message}`,
          )
          .join('; '),
      );
    const p = parsed.data as Json;
    const row = await this.integrations.getEntityForOrg(orgId, integrationId);
    if (
      row.organizationId !== orgId ||
      row.provider !== IntegrationProvider.GHL_CRM ||
      !row.isActive ||
      !row.locationId ||
      !row.apiKey.trim()
    )
      throw new NotFoundException('Active CRM connection not found');
    const creds = { token: row.apiKey, locationId: row.locationId };
    const locationId = row.locationId;
    const request = (
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      path: string,
      body?: Json,
    ) => this.ghl.crmRequest(creds, method, path, body);
    // HighLevel v3 is selected by the Version header, not a URL prefix.
    const opportunityRequest = (
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      path: string,
      body?: Json,
    ) => this.ghl.crmRequest(creds, method, path, body, 'v3');
    const query = (values: Json): string =>
      new URLSearchParams(
        Object.entries(values)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ).toString();
    const data = object(p.data);
    const id = String(p.id ?? '');
    const contactId = String(p.contactId ?? data.contactId ?? '');
    const checkLocation = (value: Json) => {
      if (value.locationId !== locationId)
        throw new NotFoundException('CRM record not found');
      return value;
    };
    const contact = async (target: string) =>
      checkLocation(
        resource(await request('GET', `/contacts/${target}`), 'contact'),
      );
    const calendars = async () =>
      items(
        (await request('GET', `/calendars/?${query({ locationId })}`))
          .calendars,
      );
    const calendar = async (target: string) => {
      if (!(await calendars()).some((c) => c.id === target))
        throw new NotFoundException('CRM calendar not found');
    };
    const pipelines = async () =>
      items(
        (
          await opportunityRequest(
            'GET',
            `/opportunities/pipelines?${query({ locationId })}`,
          )
        ).pipelines,
      );
    const pipeline = async (target: string, stage?: string) => {
      const found = (await pipelines()).find((c) => c.id === target);
      if (!found || (stage && !items(found.stages).some((s) => s.id === stage)))
        throw new NotFoundException('CRM pipeline or stage not found');
    };
    const event = async () => {
      const response = await request(
        'GET',
        `/calendars/events/appointments/${id}`,
      );
      // Live HighLevel responses use "appointment"; older responses use "event".
      const found = resource(resource(response, 'appointment'), 'event');
      if (found.locationId !== undefined) {
        checkLocation(found);
      } else {
        // HighLevel appointment receipts can omit locationId. In that case,
        // prove tenant ownership through the event's calendar before mutation.
        if (typeof found.calendarId !== 'string' || !found.calendarId)
          throw new NotFoundException('CRM record not found');
        await calendar(found.calendarId);
      }
      return found;
    };
    const readCursor = (): Json => {
      if (!p.cursor) return {};
      try {
        const value = object(
          JSON.parse(
            Buffer.from(String(p.cursor), 'base64url').toString('utf8'),
          ),
        );
        if (
          typeof value.startAfterId !== 'string' ||
          !/^[a-zA-Z0-9_-]{1,120}$/.test(value.startAfterId) ||
          !['number', 'string', 'undefined'].includes(typeof value.startAfter)
        )
          throw new Error();
        return {
          startAfterId: value.startAfterId,
          startAfter: value.startAfter,
        };
      } catch {
        throw new BadRequestException('Invalid contact cursor');
      }
    };
    const action = command.action;
    if (action === 'contacts.list') {
      const result = await request(
        'GET',
        `/contacts/?${query({ locationId, limit: p.limit, query: p.query, ...readCursor() })}`,
      );
      const meta = object(result.meta);
      return {
        ...result,
        nextCursor:
          meta.startAfterId && items(result.contacts).length >= Number(p.limit)
            ? Buffer.from(
                JSON.stringify({
                  startAfterId: meta.startAfterId,
                  startAfter: meta.startAfter,
                }),
              ).toString('base64url')
            : null,
      };
    }
    if (action === 'contacts.create')
      return request('POST', '/contacts/', {
        ...data,
        locationId,
        source: 'Speeko CRM',
      });
    if (action.startsWith('contacts.')) {
      const found = await contact(id);
      if (action === 'contacts.get') return { contact: found };
      if (action === 'contacts.update')
        return request('PUT', `/contacts/${id}`, data);
      return request('DELETE', `/contacts/${id}`);
    }
    if (action.startsWith('notes.') || action.startsWith('tasks.')) {
      await contact(contactId);
      const [kind, operation] = action.split('.');
      const path = `/contacts/${contactId}/${kind}`;
      if (operation === 'list') return request('GET', path);
      if (operation === 'create') return request('POST', path, data);
      const existing = await request('GET', path);
      if (!items(existing[kind]).some((item) => item.id === id))
        throw new NotFoundException('CRM record not found');
      return request(
        operation === 'delete' ? 'DELETE' : 'PUT',
        `${path}/${id}`,
        operation === 'delete' ? undefined : data,
      );
    }
    if (action === 'calendars.list') return { calendars: await calendars() };
    if (action === 'events.list' || action === 'slots.list') {
      await calendar(String(p.calendarId));
      const start = Date.parse(String(p.startTime)),
        end = Date.parse(String(p.endTime));
      if (action === 'slots.list')
        return request(
          'GET',
          `/calendars/${p.calendarId}/free-slots?${query({ startDate: start, endDate: end, timezone: p.timezone })}`,
        );
      return request(
        'GET',
        `/calendars/events?${query({ locationId, calendarId: p.calendarId, startTime: start, endTime: end })}`,
      );
    }
    if (action === 'events.create') {
      await contact(contactId);
      await calendar(String(data.calendarId));
      return request('POST', '/calendars/events/appointments', {
        ...data,
        locationId,
        toNotify: true,
        ignoreFreeSlotValidation: false,
      });
    }
    if (action.startsWith('events.')) {
      const existing = await event();
      if (data.calendarId) await calendar(String(data.calendarId));
      if (action === 'events.update') {
        const start = Date.parse(String(data.startTime ?? existing.startTime));
        const end = Date.parse(String(data.endTime ?? existing.endTime));
        if (
          (data.startTime || data.endTime) &&
          (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
        )
          throw new BadRequestException('End must be after start');
        return request('PUT', `/calendars/events/appointments/${id}`, {
          ...data,
          toNotify: true,
          ignoreFreeSlotValidation: false,
        });
      }
      return request('DELETE', `/calendars/events/${id}`);
    }
    if (action === 'pipelines.list') return { pipelines: await pipelines() };
    if (action === 'opportunities.list')
      return opportunityRequest(
        'GET',
        `/opportunities/search?${query({ locationId, limit: p.limit, page: p.page, q: p.query, pipelineId: p.pipelineId, status: p.status })}`,
      );
    if (action === 'opportunities.create') {
      await contact(contactId);
      await pipeline(String(data.pipelineId), String(data.pipelineStageId));
      return opportunityRequest('POST', '/opportunities/', {
        ...data,
        locationId,
      });
    }
    if (action.startsWith('opportunities.')) {
      const existing = checkLocation(
        resource(
          await opportunityRequest('GET', `/opportunities/${id}`),
          'opportunity',
        ),
      );
      if (data.pipelineId || data.pipelineStageId)
        await pipeline(
          String(data.pipelineId ?? existing.pipelineId),
          String(data.pipelineStageId ?? existing.pipelineStageId),
        );
      return opportunityRequest(
        action === 'opportunities.delete' ? 'DELETE' : 'PUT',
        `/opportunities/${id}`,
        action === 'opportunities.delete' ? undefined : data,
      );
    }
    if (action === 'conversations.list')
      return request(
        'GET',
        `/conversations/search?${query({ locationId, limit: p.limit, query: p.query, sort: 'desc', startAfterDate: p.cursor })}`,
      );
    if (action === 'messages.list') {
      const found = resource(
        await request('GET', `/conversations/${id}`),
        'conversation',
      );
      checkLocation(found);
      return request(
        'GET',
        `/conversations/${id}/messages?${query({ limit: p.limit, lastMessageId: p.cursor })}`,
      );
    }
    if (action === 'messages.send') {
      const found = await contact(contactId);
      const settings = object(
        object(found.dndSettings)[data.type === 'SMS' ? 'SMS' : 'WhatsApp'],
      );
      if (found.dnd === true || settings.status === 'active')
        throw new BadRequestException(
          'This contact has Do Not Disturb enabled for this channel.',
        );
      return request('POST', '/conversations/messages', { ...data, contactId });
    }
    if (action === 'workflows.list')
      return request('GET', `/workflows/?${query({ locationId })}`);
    if (action.startsWith('workflows.')) {
      await contact(contactId);
      const workflows = await request(
        'GET',
        `/workflows/?${query({ locationId })}`,
      );
      if (!items(workflows.workflows).some((w) => w.id === id))
        throw new NotFoundException('CRM workflow not found');
      return request(
        action === 'workflows.enroll' ? 'POST' : 'DELETE',
        `/contacts/${contactId}/workflow/${id}`,
        action === 'workflows.enroll'
          ? { eventStartTime: new Date().toISOString() }
          : undefined,
      );
    }
    if (action === 'tags.list')
      return request('GET', `/locations/${locationId}/tags`);
    if (action === 'fields.list')
      return request('GET', `/locations/${locationId}/customFields`);
    if (action === 'users.list')
      return request('GET', `/users/?${query({ locationId })}`);
    throw new BadRequestException('Unsupported CRM action');
  }
}
