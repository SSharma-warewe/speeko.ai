import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { IntegrationProvider } from '@call-agent/contracts';
import { OrganizationIntegration } from './organization-integration.entity';

@Injectable()
export class OrganizationIntegrationsRepository {
  constructor(
    @InjectRepository(OrganizationIntegration)
    private readonly repo: Repository<OrganizationIntegration>,
  ) {}

  create(data: DeepPartial<OrganizationIntegration>): OrganizationIntegration {
    return this.repo.create(data);
  }

  save(row: OrganizationIntegration): Promise<OrganizationIntegration> {
    return this.repo.save(row);
  }

  findByIdAndOrg(
    organizationId: string,
    id: string,
  ): Promise<OrganizationIntegration | null> {
    return this.repo.findOne({ where: { id, organizationId } });
  }

  findByOrganization(
    organizationId: string,
  ): Promise<OrganizationIntegration[]> {
    return this.repo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Active WhatsApp connection for an inbound Meta phone_number_id. */
  findActiveWhatsAppByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<OrganizationIntegration | null> {
    return this.repo.findOne({
      where: {
        provider: IntegrationProvider.WHATSAPP,
        phoneNumberId,
        isActive: true,
      },
    });
  }

  remove(row: OrganizationIntegration): Promise<OrganizationIntegration> {
    return this.repo.remove(row);
  }
}
