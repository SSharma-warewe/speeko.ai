import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
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
}
