import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { orgAgentDefaultTaskKey } from '../agents/org-agent-task';
import { OrganizationAgentsService } from '../agents/organization-agents.service';
import { CallDialService } from '../calls/services/call-dial.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { SipTrunksService } from '../sip-trunks/sip-trunks.service';
import {
  DEFAULT_TASK_KEY,
  isKnownTaskKey,
} from '../tools/known-tools';
import {
  generateApiKey,
  generatePublicId,
  verifyApiKey,
} from './api-key.util';
import { CreateIntegrationEndpointDto } from './dto/create-integration-endpoint.dto';
import {
  IntegrationEndpointResponseDto,
  IntegrationEndpointSecretResponseDto,
} from './dto/integration-endpoint-response.dto';
import { PublicEnqueueCallDto } from './dto/public-enqueue-call.dto';
import { PublicEnqueueResponseDto } from './dto/public-enqueue-response.dto';
import { UpdateIntegrationEndpointDto } from './dto/update-integration-endpoint.dto';
import { IntegrationEndpoint } from './integration-endpoint.entity';
import { IntegrationEndpointsRepository } from './integration-endpoints.repository';
import {
  toIntegrationEndpointResponse,
  toIntegrationEndpointSecretResponse,
} from './mappers/integration-endpoint-response.mapper';

@Injectable()
export class IntegrationEndpointsService {
  constructor(
    private readonly repository: IntegrationEndpointsRepository,
    private readonly organizationsService: OrganizationsService,
    private readonly organizationAgentsService: OrganizationAgentsService,
    private readonly sipTrunksService: SipTrunksService,
    private readonly callDial: CallDialService,
  ) {}

  async listForOrg(
    organizationId: string,
  ): Promise<IntegrationEndpointResponseDto[]> {
    await this.organizationsService.findById(organizationId);
    const rows = await this.repository.findByOrganization(organizationId);
    return rows.map(toIntegrationEndpointResponse);
  }

  async getOneForOrg(
    organizationId: string,
    id: string,
  ): Promise<IntegrationEndpointResponseDto> {
    const row = await this.loadForOrg(organizationId, id);
    return toIntegrationEndpointResponse(row);
  }

  async createForOrg(
    organizationId: string,
    dto: CreateIntegrationEndpointDto,
    createdByUserId?: string | null,
  ): Promise<IntegrationEndpointSecretResponseDto> {
    await this.organizationsService.findById(organizationId);

    const orgAgent =
      await this.organizationAgentsService.getEntityWithTemplate(
        organizationId,
        dto.organizationAgentId,
      );
    if (!orgAgent.isActive) {
      throw new BadRequestException(
        `Organization agent is inactive: ${dto.organizationAgentId}`,
      );
    }

    const taskKey = this.resolveTaskKey(
      dto.task,
      orgAgentDefaultTaskKey(orgAgent, orgAgent.agent),
      orgAgent.agent?.defaultTaskKey,
    );

    if (dto.sipTrunkId) {
      await this.sipTrunksService.resolveOutboundForCall(
        organizationId,
        dto.sipTrunkId,
      );
    }

    const { apiKey, keyPrefix, keyHash } = generateApiKey();
    const publicId = generatePublicId();

    const row = this.repository.create({
      organizationId,
      name: dto.name.trim(),
      publicId,
      keyPrefix,
      keyHash,
      organizationAgentId: orgAgent.id,
      taskKey,
      sipTrunkId: dto.sipTrunkId ?? null,
      maxAttempts: dto.maxAttempts ?? null,
      priority: dto.priority ?? 0,
      maxConcurrent: dto.maxConcurrent ?? null,
      defaultContext: dto.defaultContext ?? null,
      isActive: true,
      lastUsedAt: null,
      createdByUserId: createdByUserId ?? null,
    });

    const saved = await this.repository.save(row);
    return toIntegrationEndpointSecretResponse(saved, apiKey);
  }

  async updateForOrg(
    organizationId: string,
    id: string,
    dto: UpdateIntegrationEndpointDto,
  ): Promise<IntegrationEndpointResponseDto> {
    const row = await this.loadForOrg(organizationId, id);

    if (dto.name !== undefined) {
      row.name = dto.name.trim();
    }

    if (dto.organizationAgentId !== undefined) {
      const orgAgent =
        await this.organizationAgentsService.getEntityWithTemplate(
          organizationId,
          dto.organizationAgentId,
        );
      if (!orgAgent.isActive) {
        throw new BadRequestException(
          `Organization agent is inactive: ${dto.organizationAgentId}`,
        );
      }
      row.organizationAgentId = orgAgent.id;
      // If task not also patched, keep existing task_key (may still be valid).
    }

    if (dto.task !== undefined) {
      const orgAgent =
        await this.organizationAgentsService.getEntityWithTemplate(
          organizationId,
          row.organizationAgentId,
        );
      row.taskKey = this.resolveTaskKey(
        dto.task,
        orgAgentDefaultTaskKey(orgAgent, orgAgent.agent),
        orgAgent.agent?.defaultTaskKey,
      );
    }

    if (dto.sipTrunkId !== undefined) {
      if (dto.sipTrunkId === null) {
        row.sipTrunkId = null;
      } else {
        await this.sipTrunksService.resolveOutboundForCall(
          organizationId,
          dto.sipTrunkId,
        );
        row.sipTrunkId = dto.sipTrunkId;
      }
    }

    if (dto.maxAttempts !== undefined) {
      row.maxAttempts = dto.maxAttempts;
    }
    if (dto.priority !== undefined) {
      row.priority = dto.priority;
    }
    if (dto.maxConcurrent !== undefined) {
      row.maxConcurrent = dto.maxConcurrent;
    }
    if (dto.defaultContext !== undefined) {
      row.defaultContext = dto.defaultContext;
    }
    if (dto.isActive !== undefined) {
      row.isActive = dto.isActive;
    }

    const saved = await this.repository.save(row);
    return toIntegrationEndpointResponse(saved);
  }

  async rotateKeyForOrg(
    organizationId: string,
    id: string,
  ): Promise<IntegrationEndpointSecretResponseDto> {
    const row = await this.loadForOrg(organizationId, id);
    const { apiKey, keyPrefix, keyHash } = generateApiKey();
    row.keyPrefix = keyPrefix;
    row.keyHash = keyHash;
    const saved = await this.repository.save(row);
    return toIntegrationEndpointSecretResponse(saved, apiKey);
  }

  async deleteForOrg(organizationId: string, id: string): Promise<void> {
    const row = await this.loadForOrg(organizationId, id);
    await this.repository.remove(row);
  }

  /**
   * Authenticate by publicId + API key, merge thin request with endpoint config,
   * enqueue a single pending call via the shared calls enqueue path.
   */
  async enqueuePublicCall(
    publicId: string,
    apiKey: string | undefined,
    dto: PublicEnqueueCallDto,
  ): Promise<PublicEnqueueResponseDto> {
    if (!apiKey?.trim()) {
      throw new UnauthorizedException('API key required');
    }

    const endpoint = await this.repository.findByPublicId(publicId);
    if (!endpoint) {
      throw new NotFoundException('Integration endpoint not found');
    }

    if (!verifyApiKey(apiKey.trim(), endpoint.keyHash)) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (!endpoint.isActive) {
      throw new ForbiddenException('Integration endpoint is disabled');
    }

    const org = await this.organizationsService.findById(
      endpoint.organizationId,
    );
    if (!org.isActive) {
      throw new ForbiddenException('Organization is inactive');
    }

    const mergedContext = this.mergeContext(endpoint, dto);

    const result = await this.callDial.enqueueCallsForOrg(
      endpoint.organizationId,
      {
        organizationAgentId: endpoint.organizationAgentId,
        task: endpoint.taskKey,
        sipTrunkId: endpoint.sipTrunkId ?? undefined,
        maxAttempts: endpoint.maxAttempts ?? undefined,
        priority: endpoint.priority,
        maxConcurrent: endpoint.maxConcurrent ?? undefined,
        calls: [
          {
            toNumber: dto.phoneNumber.trim(),
            context: mergedContext,
          },
        ],
      },
    );

    endpoint.lastUsedAt = new Date();
    await this.repository.save(endpoint);

    const call = result.calls[0];
    return {
      callId: call.id,
      batchId: result.batchId,
      status: call.status,
      toNumber: call.toNumber ?? dto.phoneNumber.trim(),
      externalId: dto.externalId?.trim() || null,
    };
  }

  private mergeContext(
    endpoint: IntegrationEndpoint,
    dto: PublicEnqueueCallDto,
  ): Record<string, unknown> {
    const base =
      endpoint.defaultContext && typeof endpoint.defaultContext === 'object'
        ? { ...endpoint.defaultContext }
        : {};
    const request =
      dto.context && typeof dto.context === 'object' ? { ...dto.context } : {};
    const externalId = dto.externalId?.trim();
    return {
      ...base,
      ...request,
      phoneNumber: dto.phoneNumber.trim(),
      ...(externalId ? { externalId } : {}),
    };
  }

  private async loadForOrg(
    organizationId: string,
    id: string,
  ): Promise<IntegrationEndpoint> {
    await this.organizationsService.findById(organizationId);
    const row = await this.repository.findByIdAndOrg(organizationId, id);
    if (!row) {
      throw new NotFoundException(
        `Integration endpoint not found: ${id}`,
      );
    }
    return row;
  }

  private resolveTaskKey(
    requested: string | undefined,
    ...fallbacks: Array<string | null | undefined>
  ): string {
    const candidates = [requested, ...fallbacks, DEFAULT_TASK_KEY];
    for (const raw of candidates) {
      const key = raw?.trim();
      if (!key) continue;
      if (isKnownTaskKey(key) || key.length > 0) {
        return key;
      }
    }
    return DEFAULT_TASK_KEY;
  }
}
