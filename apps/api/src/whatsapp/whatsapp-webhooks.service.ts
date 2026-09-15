import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrganizationsService } from '../organizations/organizations.service';
import { GenerateWhatsAppWebhookConfigDto } from './dto/generate-whatsapp-webhook-config.dto';
import { WhatsAppWebhookAckDto } from './dto/whatsapp-webhook-ack.dto';
import {
  WhatsAppWebhookConfigResponseDto,
  WhatsAppWebhookConfigSecretResponseDto,
} from './dto/whatsapp-webhook-config-response.dto';
import {
  extractWhatsAppWebhook,
  isWebhookPayloadObject,
} from './lib/extract-whatsapp-webhook';
import {
  toWhatsAppWebhookConfigResponse,
  toWhatsAppWebhookConfigSecretResponse,
  whatsappCallbackUrl,
} from './mappers/whatsapp-webhook-config-response.mapper';
import {
  generateVerifyToken,
  hashVerifyToken,
  verifyTokenMatches,
  verifyTokenPrefixFrom,
} from './verify-token.util';
import { WhatsAppWebhookConfigsRepository } from './whatsapp-webhook-configs.repository';
import { WhatsAppWebhookEventsRepository } from './whatsapp-webhook-events.repository';

@Injectable()
export class WhatsAppWebhooksService {
  private readonly logger = new Logger(WhatsAppWebhooksService.name);

  constructor(
    private readonly configs: WhatsAppWebhookConfigsRepository,
    private readonly events: WhatsAppWebhookEventsRepository,
    private readonly organizationsService: OrganizationsService,
    private readonly config: ConfigService,
  ) {}

  async getConfigForOrg(
    organizationId: string,
  ): Promise<WhatsAppWebhookConfigResponseDto> {
    await this.organizationsService.findById(organizationId);
    const row = await this.configs.findByOrganization(organizationId);
    if (!row) {
      throw new NotFoundException('WhatsApp webhook configuration not found');
    }
    return toWhatsAppWebhookConfigResponse(row, this.callbackUrl());
  }

  async generateConfigForOrg(
    organizationId: string,
    dto: GenerateWhatsAppWebhookConfigDto,
  ): Promise<WhatsAppWebhookConfigSecretResponseDto> {
    await this.organizationsService.findById(organizationId);

    const phoneNumberId = normalizeOptionalId(dto.phoneNumberId);
    const wabaId = normalizeOptionalId(dto.wabaId);
    if (!phoneNumberId && !wabaId) {
      throw new BadRequestException(
        'Provide phoneNumberId and/or wabaId so incoming webhooks can be routed to this organization',
      );
    }

    await this.assertIdsAvailable(organizationId, phoneNumberId, wabaId);

    const generated = this.resolveGeneratedToken(dto.verifyToken);
    const existing = await this.configs.findByOrganization(organizationId);
    const row = existing
      ? existing
      : this.configs.create({
          organizationId,
          isActive: true,
        });

    row.phoneNumberId = phoneNumberId;
    row.wabaId = wabaId;
    row.verifyTokenHash = generated.verifyTokenHash;
    row.verifyTokenPrefix = generated.verifyTokenPrefix;
    row.isActive = true;

    const saved = await this.configs.save(row);
    return toWhatsAppWebhookConfigSecretResponse(
      saved,
      this.callbackUrl(),
      generated.verifyToken,
    );
  }

  verifySubscription(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): Promise<string> {
    return this.verifySubscriptionAsync(mode, token, challenge);
  }

  async ingestWebhook(payload: unknown): Promise<WhatsAppWebhookAckDto> {
    if (!isWebhookPayloadObject(payload)) {
      throw new BadRequestException('Invalid webhook payload');
    }

    const extracted = extractWhatsAppWebhook(payload);
    const organizationId = await this.resolveOrganizationId(
      extracted.phoneNumberId,
      extracted.wabaId,
    );

    const row = this.events.create({
      organizationId,
      eventType: extracted.eventType,
      payload,
      receivedAt: new Date(),
    });
    await this.events.save(row);
    return { success: true };
  }

  private async verifySubscriptionAsync(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): Promise<string> {
    const modeText = (mode ?? '').trim();
    const provided = (token ?? '').trim();
    const challengeText = (challenge ?? '').trim();
    const tokenPrefix = provided ? verifyTokenPrefixFrom(provided) : 'empty';
    if (modeText !== 'subscribe' || !provided || !challengeText) {
      this.logger.warn(
        `WhatsApp GET verify rejected mode=${modeText || 'empty'} tokenPrefix=${tokenPrefix}`,
      );
      throw new ForbiddenException('Verification failed');
    }

    const envToken = this.config.get<string>('WHATSAPP_VERIFY_TOKEN')?.trim();
    if (
      envToken &&
      verifyTokenMatches(provided, hashVerifyToken(envToken))
    ) {
      this.logger.log(
        `WhatsApp GET verify ok via WHATSAPP_VERIFY_TOKEN tokenPrefix=${tokenPrefix}`,
      );
      return challengeText;
    }

    const row = await this.configs.findByVerifyTokenHash(
      hashVerifyToken(provided),
    );
    if (
      !row ||
      !row.isActive ||
      !verifyTokenMatches(provided, row.verifyTokenHash)
    ) {
      this.logger.warn(
        `WhatsApp GET verify rejected unknown/inactive tokenPrefix=${tokenPrefix}`,
      );
      throw new ForbiddenException('Verification failed');
    }
    this.logger.log(
      `WhatsApp GET verify ok org=${row.organizationId} tokenPrefix=${tokenPrefix}`,
    );
    return challengeText;
  }

  private async resolveOrganizationId(
    phoneNumberId: string | null,
    wabaId: string | null,
  ): Promise<string | null> {
    if (phoneNumberId) {
      const byPhone =
        await this.configs.findActiveByPhoneNumberId(phoneNumberId);
      if (byPhone) {
        return byPhone.organizationId;
      }
    }
    if (wabaId) {
      const byWaba = await this.configs.findActiveByWabaId(wabaId);
      if (byWaba) {
        return byWaba.organizationId;
      }
    }
    return null;
  }

  private async assertIdsAvailable(
    organizationId: string,
    phoneNumberId: string | null,
    wabaId: string | null,
  ): Promise<void> {
    if (phoneNumberId) {
      const taken = await this.configs.findByPhoneNumberIdExcludingOrg(
        phoneNumberId,
        organizationId,
      );
      if (taken) {
        throw new ConflictException(
          `WhatsApp phone number id already configured: ${phoneNumberId}`,
        );
      }
    }
    if (wabaId) {
      const taken = await this.configs.findByWabaIdExcludingOrg(
        wabaId,
        organizationId,
      );
      if (taken) {
        throw new ConflictException(
          `WhatsApp Business Account id already configured: ${wabaId}`,
        );
      }
    }
  }

  private callbackUrl(): string {
    return whatsappCallbackUrl(this.config.get<string>('API_BASE_URL'), {
      publicUrl: this.config.get<string>('API_PUBLIC_URL'),
      railwayPublicDomain: this.config.get<string>('RAILWAY_PUBLIC_DOMAIN'),
    });
  }

  private resolveGeneratedToken(provided?: string): {
    verifyToken: string;
    verifyTokenPrefix: string;
    verifyTokenHash: string;
  } {
    const trimmed = provided?.trim() ?? '';
    if (!trimmed) {
      return generateVerifyToken();
    }
    if (trimmed.length < 8 || trimmed.length > 200) {
      throw new BadRequestException(
        'verifyToken must be between 8 and 200 characters',
      );
    }
    return {
      verifyToken: trimmed,
      verifyTokenPrefix: verifyTokenPrefixFrom(trimmed),
      verifyTokenHash: hashVerifyToken(trimmed),
    };
  }
}

function normalizeOptionalId(value?: string): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}
