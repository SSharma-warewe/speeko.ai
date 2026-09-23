import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, IsNull, Repository } from 'typeorm';
import { WhatsAppWebhookEvent } from './whatsapp-webhook-event.entity';

@Injectable()
export class WhatsAppWebhookEventsRepository {
  constructor(
    @InjectRepository(WhatsAppWebhookEvent)
    private readonly repo: Repository<WhatsAppWebhookEvent>,
  ) {}

  create(data: DeepPartial<WhatsAppWebhookEvent>): WhatsAppWebhookEvent {
    return this.repo.create(data);
  }

  save(row: WhatsAppWebhookEvent): Promise<WhatsAppWebhookEvent> {
    return this.repo.save(row);
  }

  /**
   * This org's rows, plus posts that did not match any phone number or WABA
   * (`organization_id` null). Other orgs' rows are excluded.
   */
  findRecentForOrganization(
    organizationId: string,
    limit: number,
  ): Promise<WhatsAppWebhookEvent[]> {
    return this.repo.find({
      where: [{ organizationId }, { organizationId: IsNull() }],
      order: { receivedAt: 'DESC' },
      take: limit,
    });
  }
}
