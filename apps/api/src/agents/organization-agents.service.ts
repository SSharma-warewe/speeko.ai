import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationIntegration } from '../organization-integrations/organization-integration.entity';
import { OrganizationsService } from '../organizations/organizations.service';
import { ToolProfilesService } from '../tools/tool-profiles.service';
import { AgentDirection } from './agent.entity';
import { AgentsService, normalizeHookInstructions } from './agents.service';
import { AssignAgentDto } from './dto/assign-agent.dto';
import { CloneOrganizationAgentDto } from './dto/clone-organization-agent.dto';
import { UpdateOrganizationAgentDto } from './dto/update-organization-agent.dto';
import { toOrganizationAgentResponse } from './mappers/agent-response.mapper';
import {
  INBOUND_TASK_REQUIRED,
  isOutboundTemplate,
  OUTBOUND_NO_DEFAULT_TASK,
  storedDefaultTaskKey,
} from './org-agent-task';
import { normalizeDeliveryMode, normalizeVoice } from './voice-settings';
import { OrganizationAgent } from './organization-agent.entity';
import { OrganizationAgentsRepository } from './organization-agents.repository';
import { nextAvailableSlug, slugify } from './slug.util';

@Injectable()
export class OrganizationAgentsService {
  constructor(
    private readonly organizationAgentsRepository: OrganizationAgentsRepository,
    private readonly agentsService: AgentsService,
    private readonly organizationsService: OrganizationsService,
    private readonly toolProfilesService: ToolProfilesService,
    /**
     * Direct entity lookup only — do not inject OrganizationIntegrationsService
     * (would create AgentsModule ↔ OrganizationIntegrationsModule circular boot).
     */
    @InjectRepository(OrganizationIntegration)
    private readonly organizationIntegrationRepo: Repository<OrganizationIntegration>,
  ) {}

  private async loadWithTemplate(
    organizationId: string,
    id: string,
  ): Promise<OrganizationAgent> {
    const row =
      await this.organizationAgentsRepository.findByIdAndOrgWithAgent(
        organizationId,
        id,
      );
    if (!row) {
      throw new NotFoundException(
        `Organization agent not found: ${id} (org ${organizationId})`,
      );
    }
    return row;
  }

  private async toResponse(row: OrganizationAgent) {
    const tools = await this.toolProfilesService.resolveEnabledToolIds(
      row.toolProfileId,
    );
    return toOrganizationAgentResponse(row, tools);
  }

  private async assertSlugAvailable(
    organizationId: string,
    slug: string,
    excludeId?: string,
  ): Promise<void> {
    const existing =
      await this.organizationAgentsRepository.findByOrgAndSlug(
        organizationId,
        slug,
      );
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        `Organization agent slug already in use: ${slug}`,
      );
    }
  }

  private async allocateSlug(
    organizationId: string,
    preferred: string,
    excludeId?: string,
  ): Promise<string> {
    const existing = excludeId
      ? await this.organizationAgentsRepository.listSlugsByOrganizationExcluding(
          organizationId,
          excludeId,
        )
      : await this.organizationAgentsRepository.listSlugsByOrganization(
          organizationId,
        );
    return nextAvailableSlug(preferred, existing);
  }

  async listByOrganization(organizationId: string) {
    await this.organizationsService.findById(organizationId);
    const rows =
      await this.organizationAgentsRepository.findByOrganizationWithAgent(
        organizationId,
      );
    return Promise.all(rows.map((row) => this.toResponse(row)));
  }

  async getOne(organizationId: string, id: string) {
    await this.organizationsService.findById(organizationId);
    const row = await this.loadWithTemplate(organizationId, id);
    return this.toResponse(row);
  }

  /** Internal: entity + template relation for call orchestration. */
  async getEntityWithTemplate(
    organizationId: string,
    id: string,
  ): Promise<OrganizationAgent> {
    await this.organizationsService.findById(organizationId);
    return this.loadWithTemplate(organizationId, id);
  }

  /**
   * Create a new org agent config from a platform template.
   * Multiple configs may share the same template (inbound/outbound).
   */
  async assign(organizationId: string, dto: AssignAgentDto) {
    await this.organizationsService.findById(organizationId);
    const template = await this.agentsService.findById(dto.agentId);

    if (!template.isActive) {
      throw new ConflictException(
        `Agent template is inactive: ${template.key}`,
      );
    }

    const name = (dto.name?.trim() || template.name).slice(0, 255);
    const preferredSlug = dto.slug?.trim()
      ? slugify(dto.slug)
      : slugify(dto.name?.trim() || template.key);
    const slug = dto.slug?.trim()
      ? preferredSlug
      : await this.allocateSlug(organizationId, preferredSlug);
    if (dto.slug?.trim()) {
      await this.assertSlugAvailable(organizationId, slug);
    }

    let toolProfileId =
      dto.toolProfileId ?? template.defaultToolProfileId ?? null;
    if (toolProfileId) {
      await this.toolProfilesService.findById(toolProfileId);
    }

    let calendarIntegrationId: string | null = null;
    if (dto.calendarIntegrationId) {
      await this.assertCalendarIntegration(
        organizationId,
        dto.calendarIntegrationId,
      );
      calendarIntegrationId = dto.calendarIntegrationId;
    }

    const row = this.organizationAgentsRepository.create({
      organizationId,
      agentId: template.id,
      name,
      slug,
      systemPrompt: template.systemPrompt,
      onEnterInstructions: template.onEnterInstructions ?? null,
      onExitInstructions: template.onExitInstructions ?? null,
      toolProfileId,
      calendarIntegrationId,
      defaultTaskKey: storedDefaultTaskKey(
        template.direction,
        dto.defaultTaskKey,
        template.defaultTaskKey,
      ),
      voice: template.voice,
      model: template.model,
      temperature: template.temperature,
      speakingRate: template.speakingRate,
      deliveryMode: template.deliveryMode,
      isActive: true,
    });
    const saved = await this.organizationAgentsRepository.save(row);
    const withTemplate = await this.loadWithTemplate(organizationId, saved.id);
    return this.toResponse(withTemplate);
  }

  /** Clone an existing org agent with a new name/slug (copies persona + tools). */
  async clone(
    organizationId: string,
    id: string,
    dto: CloneOrganizationAgentDto,
  ) {
    await this.organizationsService.findById(organizationId);
    const source = await this.loadWithTemplate(organizationId, id);

    const name = dto.name.trim().slice(0, 255);
    const preferredSlug = dto.slug?.trim()
      ? slugify(dto.slug)
      : slugify(dto.name);
    const slug = dto.slug?.trim()
      ? preferredSlug
      : await this.allocateSlug(organizationId, preferredSlug);
    if (dto.slug?.trim()) {
      await this.assertSlugAvailable(organizationId, slug);
    }

    const row = this.organizationAgentsRepository.create({
      organizationId,
      agentId: source.agentId,
      name,
      slug,
      systemPrompt: source.systemPrompt,
      onEnterInstructions: source.onEnterInstructions,
      onExitInstructions: source.onExitInstructions,
      toolProfileId: source.toolProfileId,
      calendarIntegrationId: source.calendarIntegrationId,
      defaultTaskKey: storedDefaultTaskKey(
        source.agent?.direction ?? AgentDirection.INBOUND,
        isOutboundTemplate(source.agent) ? undefined : source.defaultTaskKey,
        source.agent?.defaultTaskKey,
      ),
      voice: source.voice,
      model: source.model,
      temperature: source.temperature,
      speakingRate: source.speakingRate,
      deliveryMode: source.deliveryMode,
      isActive: source.isActive,
    });
    const saved = await this.organizationAgentsRepository.save(row);
    const withTemplate = await this.loadWithTemplate(organizationId, saved.id);
    return this.toResponse(withTemplate);
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateOrganizationAgentDto,
  ) {
    await this.organizationsService.findById(organizationId);
    const row = await this.loadWithTemplate(organizationId, id);

    if (dto.name !== undefined) {
      row.name = dto.name.trim().slice(0, 255);
    }
    if (dto.slug !== undefined) {
      const slug = slugify(dto.slug);
      await this.assertSlugAvailable(organizationId, slug, id);
      row.slug = slug;
    }
    if (dto.systemPrompt !== undefined) {
      row.systemPrompt = dto.systemPrompt;
    }
    if (dto.onEnterInstructions !== undefined) {
      row.onEnterInstructions = normalizeHookInstructions(
        dto.onEnterInstructions,
      );
    }
    if (dto.onExitInstructions !== undefined) {
      row.onExitInstructions = normalizeHookInstructions(
        dto.onExitInstructions,
      );
    }
    if (dto.toolProfileId !== undefined) {
      await this.toolProfilesService.findById(dto.toolProfileId);
      row.toolProfileId = dto.toolProfileId;
    }
    if (dto.calendarIntegrationId !== undefined) {
      if (dto.calendarIntegrationId === null) {
        row.calendarIntegrationId = null;
      } else {
        await this.assertCalendarIntegration(
          organizationId,
          dto.calendarIntegrationId,
        );
        row.calendarIntegrationId = dto.calendarIntegrationId;
      }
    }
    const direction = row.agent?.direction;
    if (direction === AgentDirection.OUTBOUND) {
      if (dto.defaultTaskKey !== undefined) {
        throw new BadRequestException(OUTBOUND_NO_DEFAULT_TASK);
      }
      row.defaultTaskKey = null;
    } else if (dto.defaultTaskKey !== undefined) {
      const key = dto.defaultTaskKey?.trim() ?? '';
      if (!key) {
        throw new BadRequestException(INBOUND_TASK_REQUIRED);
      }
      row.defaultTaskKey = key;
    }
    if (dto.voice !== undefined) {
      row.voice = normalizeVoice(dto.voice);
    }
    if (dto.model !== undefined) {
      row.model = dto.model;
    }
    if (dto.temperature !== undefined) {
      row.temperature = dto.temperature;
    }
    if (dto.speakingRate !== undefined) {
      row.speakingRate = dto.speakingRate;
    }
    if (dto.deliveryMode !== undefined) {
      row.deliveryMode = normalizeDeliveryMode(dto.deliveryMode);
    }
    if (dto.isActive !== undefined) {
      row.isActive = dto.isActive;
    }

    await this.organizationAgentsRepository.save(row);
    const reloaded = await this.loadWithTemplate(organizationId, id);
    return this.toResponse(reloaded);
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.organizationsService.findById(organizationId);
    const row = await this.loadWithTemplate(organizationId, id);
    try {
      await this.organizationAgentsRepository.remove(row);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        /foreign key|violates foreign key|FK_|RESTRICT/i.test(message) ||
        (err as { code?: string })?.code === '23503'
      ) {
        throw new ConflictException(
          'Cannot delete organization agent while it is referenced by integration endpoints, dispatch rules, or other records. Re-point those first.',
        );
      }
      throw err;
    }
  }

  private async assertCalendarIntegration(
    organizationId: string,
    integrationId: string,
  ): Promise<void> {
    const row = await this.organizationIntegrationRepo.findOne({
      where: { id: integrationId, organizationId },
    });
    if (!row) {
      throw new NotFoundException(
        `Calendar integration not found: ${integrationId}`,
      );
    }
  }
}
