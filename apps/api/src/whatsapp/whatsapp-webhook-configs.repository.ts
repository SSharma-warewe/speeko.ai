import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Not, Repository } from 'typeorm';
import { WhatsAppWebhookConfig } from './whatsapp-webhook-config.entity';

@Injectable()
export class WhatsAppWebhookConfigsRepository {
  constructor(
    @InjectRepository(WhatsAppWebhookConfig)
    private readonly repo: Repository<WhatsAppWebhookConfig>,
  ) {}

  create(data: DeepPartial<WhatsAppWebhookConfig>): WhatsAppWebhookConfig {
    return this.repo.create(data);
  }

  save(row: WhatsAppWebhookConfig): Promise<WhatsAppWebhookConfig> {
    return this.repo.save(row);
  }

  findByOrganization(
    organizationId: string,
  ): Promise<WhatsAppWebhookConfig | null> {
    return this.repo.findOne({ where: { organizationId } });
  }

  findByVerifyTokenHash(
    verifyTokenHash: string,
  ): Promise<WhatsAppWebhookConfig | null> {
    return this.repo.findOne({ where: { verifyTokenHash } });
  }

  findActiveByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<WhatsAppWebhookConfig | null> {
    return this.repo.findOne({
      where: { phoneNumberId, isActive: true },
    });
  }

  findActiveByWabaId(wabaId: string): Promise<WhatsAppWebhookConfig | null> {
    return this.repo.findOne({
      where: { wabaId, isActive: true },
    });
  }

  findByPhoneNumberIdExcludingOrg(
    phoneNumberId: string,
    organizationId: string,
  ): Promise<WhatsAppWebhookConfig | null> {
    return this.repo.findOne({
      where: { phoneNumberId, organizationId: Not(organizationId) },
    });
  }

  findByWabaIdExcludingOrg(
    wabaId: string,
    organizationId: string,
  ): Promise<WhatsAppWebhookConfig | null> {
    return this.repo.findOne({
      where: { wabaId, organizationId: Not(organizationId) },
    });
  }
}
