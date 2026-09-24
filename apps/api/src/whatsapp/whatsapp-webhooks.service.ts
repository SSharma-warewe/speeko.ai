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
import { WhatsAppWebhookEventResponseDto } from './dto/whatsapp-webhook-event-response.dto';
import {
  WhatsAppWebhookConfigResponseDto,
  WhatsAppWebhookConfigSecretResponseDto,
} from './dto/whatsapp-webhook-config-response.dto';
import {
  extractWhatsAppWebhook,
  previewWhatsAppWebhook,
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
import { WhatsAppAgentService } from '../whatsapp-agent/whatsapp-agent.service';
import { WhatsAppWebhookConfigsRepository } from './whatsapp-webhook-configs.repository';
import { WhatsAppWebhookEventsRepository } from './whatsapp-webhook-events.repository';

const WEBHOOK_EVENT_LIST_LIMIT = 50;

@Injectable()
export class WhatsAppWebhooksService {
  private readonly logger = new Logger(WhatsAppWebhooksService.name);

  constructor(
    private readonly configs: WhatsAppWebhookConfigsRepository,
    private readonly events: WhatsAppWebhookEventsRepository,
    private readonly organizationsService: OrganizationsService,
    private readonly config: ConfigService,
    private readonly receptionist: WhatsAppAgentService,
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

  async listEventsForOrg(
    organizationId: string,
  ): Promise<WhatsAppWebhookEventResponseDto[]> {
    await this.organizationsService.findById(organizationId);
    const rows = await this.events.findRecentForOrganization(
      organizationId,
      WEBHOOK_EVENT_LIST_LIMIT,
    );
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      eventType: row.eventType,
      payload: row.payload,
      receivedAt: row.receivedAt,
      preview: previewWhatsAppWebhook(row.payload),
    }));
  }

  async ingestWebhook(payload: unknown): Promise<WhatsAppWebhookAckDto> {
    const stored = payloadForStorage(payload);
    const extracted =
      stored !== null && typeof stored === 'object' && !Array.isArray(stored)
        ? extractWhatsAppWebhook(stored as Record<string, unknown>)
        : { eventType: 'unknown', phoneNumberId: null, wabaId: null };
    const organizationId = await this.resolveOrganizationId(
      extracted.phoneNumberId,
      extracted.wabaId,
    );

    const row = this.events.create({
      organizationId,
      eventType: extracted.eventType.slice(0, 80) || 'unknown',
      payload: stored,
      receivedAt: new Date(),
    });
    await this.events.save(row);
    this.logger.log(
      `WhatsApp webhook saved eventType=${extracted.eventType} org=${organizationId ?? 'none'} phoneNumberId=${extracted.phoneNumberId ?? 'none'}`,
    );
    if (stored !== null && typeof stored === 'object') {
      void this.receptionist.replyToWebhook(stored).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.error(`WhatsApp receptionist failed: ${message}`);
      });
    }
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

/**
 * JSONB column is NOT NULL. Keep objects, arrays, and scalars as sent.
 * Empty or unparsed bodies become `{ raw: null | text }` so the row still inserts.
 */
function payloadForStorage(payload: unknown): unknown {
  if (payload === undefined || payload === null) {
    return { raw: null };
  }
  return payload;
}

function normalizeOptionalId(value?: string): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}
