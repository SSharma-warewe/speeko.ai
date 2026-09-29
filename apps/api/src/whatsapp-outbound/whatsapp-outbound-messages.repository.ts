import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { WhatsAppOutboundMessage } from './whatsapp-outbound-message.entity';

@Injectable()
export class WhatsAppOutboundMessagesRepository {
  constructor(
    @InjectRepository(WhatsAppOutboundMessage)
    private readonly repo: Repository<WhatsAppOutboundMessage>,
  ) {}

  create(data: DeepPartial<WhatsAppOutboundMessage>): WhatsAppOutboundMessage {
    return this.repo.create(data);
  }

  saveMany(
    rows: WhatsAppOutboundMessage[],
  ): Promise<WhatsAppOutboundMessage[]> {
    return this.repo.save(rows);
  }

  findRecentForOrganization(
    organizationId: string,
    limit: number,
  ): Promise<WhatsAppOutboundMessage[]> {
    return this.repo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
