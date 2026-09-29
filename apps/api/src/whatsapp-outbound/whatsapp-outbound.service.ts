import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IntegrationProvider,
  WHATSAPP_CONTACT_FIELDS,
  type WhatsAppContactField,
  type WhatsAppOutboundResult,
  type WhatsAppTemplate,
  type WhatsAppVariableSource,
} from '@call-agent/contracts';
import { GhlService } from '../ghl/ghl.service';
import { MetaWhatsAppClient } from '../meta-whatsapp/meta-whatsapp.client';
import { OrganizationIntegrationsService } from '../organization-integrations/organization-integrations.service';
import { SendWhatsAppTemplateDto } from './dto/send-whatsapp-template.dto';
import {
  GhlContactsResponseDto,
  SendWhatsAppTemplateResponseDto,
  WhatsAppOutboundMessageDto,
  WhatsAppTemplatesResponseDto,
} from './dto/whatsapp-outbound-response.dto';
import { buildTemplateComponents } from './lib/build-components';
import { normalizeWhatsAppPhone } from './lib/phone';
import { toWhatsAppTemplate } from './lib/template-parser';
import { WhatsAppOutboundMessagesRepository } from './whatsapp-outbound-messages.repository';

const CONTACT_PAGE_SIZE = 25;
const SEND_CONCURRENCY = 5;
const HISTORY_LIMIT = 100;
const FIELD_SET = new Set<string>(WHATSAPP_CONTACT_FIELDS);

type SendJob = {
  index: number;
  to: string;
  components: unknown[];
};

@Injectable()
export class WhatsAppOutboundService {
  constructor(
    private readonly integrations: OrganizationIntegrationsService,
    private readonly meta: MetaWhatsAppClient,
    private readonly ghl: GhlService,
    private readonly messages: WhatsAppOutboundMessagesRepository,
    private readonly config: ConfigService,
  ) {}

  /** Templates fetched live from Meta for the org's WABA (sendable first). */
  async listTemplates(
    organizationId: string,
  ): Promise<WhatsAppTemplatesResponseDto> {
    const { templates } = await this.loadTemplates(organizationId);
    return { templates };
  }

  /** GoHighLevel contacts, fetched live (never copied into our database). */
  async listContacts(
    organizationId: string,
    query?: string,
    cursor?: string,
  ): Promise<GhlContactsResponseDto> {
    const integration = await this.integrations.getActiveEntityByProvider(
      organizationId,
      IntegrationProvider.GHL_CONTACTS,
    );
    const result = await this.ghl.listContacts({
      token: integration.apiKey,
      locationId: integration.locationId ?? '',
      query,
      cursor,
      limit: CONTACT_PAGE_SIZE,
    });
    if (!result.ok) {
      throw new BadGatewayException(
        result.message || 'Could not load GoHighLevel contacts.',
      );
    }
    return {
      contacts: result.contacts,
      nextCursor: result.nextCursor,
      total: result.total,
    };
  }

  async send(
    organizationId: string,
    dto: SendWhatsAppTemplateDto,
  ): Promise<SendWhatsAppTemplateResponseDto> {
    const { integration, templates } = await this.loadTemplates(organizationId);
    const template = templates.find(
      (t) => t.name === dto.templateName && t.language === dto.language,
    );
    if (!template) {
      throw new BadRequestException(
        `Template ${dto.templateName} (${dto.language}) was not found on your WhatsApp Business Account.`,
      );
    }
    if (!template.sendable) {
      throw new BadRequestException(
        template.unsendableReason ?? 'This template cannot be sent.',
      );
    }

    const bodyVariables = parseBodyVariables(dto.bodyVariables, template);
    const urlButtonVariable = template.urlButtonVariable
      ? parseVariableSource(dto.urlButtonVariable, 'the URL button variable')
      : undefined;

    const defaultCountryCode =
      this.config.get<string>('LIVEKIT_SIP_DEFAULT_COUNTRY_CODE') || '91';
    const batchKey = randomUUID();
    const seen = new Set<string>();
    const results = new Array<WhatsAppOutboundResult>(dto.recipients.length);
    const jobs: SendJob[] = [];

    dto.recipients.forEach((recipient, index) => {
      const name = recipient.name?.trim() || null;
      const ghlContactId = recipient.ghlContactId?.trim() || null;
      const skip = (phone: string, reason: string): void => {
        results[index] = {
          name,
          phone,
          ghlContactId,
          status: 'skipped',
          wamid: null,
          error: reason,
        };
      };

      if (recipient.dnd) {
        skip(recipient.phone, 'Contact is marked Do Not Disturb.');
        return;
      }
      const to = normalizeWhatsAppPhone(recipient.phone, defaultCountryCode);
      if (!to) {
        skip(recipient.phone, 'Invalid phone number.');
        return;
      }
      if (seen.has(to)) {
        skip(to, 'Duplicate phone number in this send.');
        return;
      }
      seen.add(to);
      const built = buildTemplateComponents(
        template,
        bodyVariables,
        urlButtonVariable,
        recipient,
      );
      if (!built.ok) {
        skip(to, built.error);
        return;
      }
      jobs.push({ index, to, components: built.components });
    });

    const token = integration.apiKey;
    const phoneNumberId = integration.phoneNumberId ?? '';
    await runWithConcurrency(jobs, SEND_CONCURRENCY, async (job) => {
      const recipient = dto.recipients[job.index];
      const sent = await this.meta.sendTemplate({
        token,
        phoneNumberId,
        to: job.to,
        templateName: template.name,
        language: template.language,
        components: job.components,
      });
      results[job.index] = {
        name: recipient.name?.trim() || null,
        phone: job.to,
        ghlContactId: recipient.ghlContactId?.trim() || null,
        status: sent.ok ? 'sent' : 'failed',
        wamid: sent.ok ? sent.data.wamid : null,
        error: sent.ok ? null : sent.message,
      };
    });

    const rows = results.map((r) =>
      this.messages.create({
        organizationId,
        integrationId: integration.id,
        batchKey,
        contactName: r.name,
        phone: r.phone.replace(/\D/g, '').slice(0, 32) || r.phone.slice(0, 32),
        ghlContactId: r.ghlContactId,
        templateName: template.name,
        language: template.language,
        status: r.status,
        wamid: r.wamid,
        error: r.error,
      }),
    );
    await this.messages.saveMany(rows);

    return {
      batchKey,
      sent: results.filter((r) => r.status === 'sent').length,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      results,
    };
  }

  async listMessages(
    organizationId: string,
  ): Promise<WhatsAppOutboundMessageDto[]> {
    const rows = await this.messages.findRecentForOrganization(
      organizationId,
      HISTORY_LIMIT,
    );
    return rows.map((r) => ({
      id: r.id,
      batchKey: r.batchKey,
      contactName: r.contactName,
      phone: r.phone,
      ghlContactId: r.ghlContactId,
      templateName: r.templateName,
      language: r.language,
      status: r.status,
      wamid: r.wamid,
      error: r.error,
      createdAt: r.createdAt,
    }));
  }

  private async loadTemplates(organizationId: string) {
    const integration = await this.integrations.getActiveEntityByProvider(
      organizationId,
      IntegrationProvider.WHATSAPP,
    );
    const result = await this.meta.listTemplates({
      token: integration.apiKey,
      wabaId: integration.wabaId ?? '',
    });
    if (!result.ok) {
      throw new BadGatewayException(
        `Could not load templates from Meta: ${result.message}`,
      );
    }
    const templates = result.data
      .map(toWhatsAppTemplate)
      .sort(
        (a, b) =>
          Number(b.sendable) - Number(a.sendable) ||
          a.name.localeCompare(b.name) ||
          a.language.localeCompare(b.language),
      );
    return { integration, templates };
  }
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next];
        next += 1;
        await worker(item);
      }
    },
  );
  await Promise.all(lanes);
}

export function parseVariableSource(
  raw: unknown,
  label: string,
): WhatsAppVariableSource {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException(`Choose a value for ${label}.`);
  }
  const value = raw as { type?: unknown; field?: unknown; text?: unknown };
  if (value.type === 'field') {
    if (typeof value.field !== 'string' || !FIELD_SET.has(value.field)) {
      throw new BadRequestException(`Unknown contact field for ${label}.`);
    }
    return { type: 'field', field: value.field as WhatsAppContactField };
  }
  if (value.type === 'text') {
    const text = typeof value.text === 'string' ? value.text.trim() : '';
    if (!text) {
      throw new BadRequestException(`Enter text for ${label}.`);
    }
    if (text.length > 1024) {
      throw new BadRequestException(`Text for ${label} is too long.`);
    }
    return { type: 'text', text };
  }
  throw new BadRequestException(`Invalid source for ${label}.`);
}

export function parseBodyVariables(
  raw: Record<string, unknown> | undefined,
  template: WhatsAppTemplate,
): Record<string, WhatsAppVariableSource> {
  const out: Record<string, WhatsAppVariableSource> = {};
  for (const variable of template.bodyVariables) {
    out[variable.key] = parseVariableSource(
      raw?.[variable.key],
      `{{${variable.key}}}`,
    );
  }
  return out;
}
