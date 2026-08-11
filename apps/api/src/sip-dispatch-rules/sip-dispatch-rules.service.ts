import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { OrganizationAgentsService } from '../agents/organization-agents.service';
import { LivekitService } from '../livekit/livekit.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { PublishResourceResultDto } from '../sip-trunks/dto/inbound-publish-result.dto';
import { SipTrunk, SipTrunkDirection } from '../sip-trunks/sip-trunk.entity';
import { SipTrunksService } from '../sip-trunks/sip-trunks.service';
import {
  DEFAULT_TASK_KEY,
  isKnownTaskKey,
} from '../tools/known-tools';
import { ToolProfilesService } from '../tools/tool-profiles.service';
import { CreateSipDispatchRuleDto } from './dto/create-sip-dispatch-rule.dto';
import { SipDispatchRuleResponseDto } from './dto/sip-dispatch-rule-response.dto';
import { UpdateSipDispatchRuleDto } from './dto/update-sip-dispatch-rule.dto';
import { toSipDispatchRuleResponse } from './mappers/sip-dispatch-rule-response.mapper';
import {
  SipDispatchRule,
  SipDispatchRuleType,
} from './sip-dispatch-rule.entity';
import { SipDispatchRulesRepository } from './sip-dispatch-rules.repository';

@Injectable()
export class SipDispatchRulesService {
  private readonly logger = new Logger(SipDispatchRulesService.name);

  constructor(
    private readonly repo: SipDispatchRulesRepository,
    private readonly organizationsService: OrganizationsService,
    @Inject(forwardRef(() => SipTrunksService))
    private readonly sipTrunksService: SipTrunksService,
    private readonly organizationAgentsService: OrganizationAgentsService,
    private readonly toolProfilesService: ToolProfilesService,
    private readonly livekit: LivekitService,
  ) {}

  async listByOrganization(
    organizationId: string,
  ): Promise<SipDispatchRuleResponseDto[]> {
    await this.organizationsService.findById(organizationId);
    const rows = await this.repo.findByOrganization(organizationId);
    return rows.map(toSipDispatchRuleResponse);
  }

  async getOne(
    organizationId: string,
    id: string,
  ): Promise<SipDispatchRuleResponseDto> {
    await this.organizationsService.findById(organizationId);
    const row = await this.requireByIdAndOrg(organizationId, id);
    return toSipDispatchRuleResponse(row);
  }

  async createDraft(
    organizationId: string,
    dto: CreateSipDispatchRuleDto,
  ): Promise<SipDispatchRuleResponseDto> {
    await this.organizationsService.findById(organizationId);

    const ruleType = dto.ruleType ?? SipDispatchRuleType.INDIVIDUAL;
    this.validateRuleFields(ruleType, {
      roomPrefix: dto.roomPrefix,
      roomName: dto.roomName,
    });

    const sipTrunkIds = dto.sipTrunkIds ?? [];
    await this.assertInboundTrunks(organizationId, sipTrunkIds);

    if (dto.organizationAgentId) {
      await this.organizationAgentsService.getEntityWithTemplate(
        organizationId,
        dto.organizationAgentId,
      );
    }

    const roomPrefix =
      ruleType === SipDispatchRuleType.INDIVIDUAL
        ? (dto.roomPrefix?.trim() || 'call-')
        : dto.roomPrefix?.trim() || null;

    const row = this.repo.create({
      organizationId,
      name: dto.name.trim(),
      ruleType,
      roomPrefix,
      roomName:
        ruleType === SipDispatchRuleType.DIRECT
          ? dto.roomName!.trim()
          : dto.roomName?.trim() || null,
      pin: dto.pin?.trim() || null,
      randomize: dto.randomize ?? false,
      sipTrunkIds,
      hidePhoneNumber: dto.hidePhoneNumber ?? false,
      attributes: dto.attributes ?? null,
      metadata: dto.metadata?.trim() || null,
      organizationAgentId: dto.organizationAgentId ?? null,
      agentName: dto.agentName?.trim() || null,
      livekitDispatchRuleId: null,
      isActive: dto.isActive ?? true,
      publishedAt: null,
    });
    const saved = await this.repo.save(row);
    return toSipDispatchRuleResponse(saved);
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateSipDispatchRuleDto,
  ): Promise<SipDispatchRuleResponseDto> {
    await this.organizationsService.findById(organizationId);
    const row = await this.requireByIdAndOrg(organizationId, id);

    if (dto.name !== undefined) {
      row.name = dto.name.trim();
    }
    if (dto.ruleType !== undefined) {
      row.ruleType = dto.ruleType;
    }
    if (dto.roomPrefix !== undefined) {
      row.roomPrefix =
        dto.roomPrefix === null ? null : dto.roomPrefix.trim() || null;
    }
    if (dto.roomName !== undefined) {
      row.roomName =
        dto.roomName === null ? null : dto.roomName.trim() || null;
    }
    if (dto.pin !== undefined) {
      row.pin = dto.pin === null ? null : dto.pin.trim() || null;
    }
    if (dto.randomize !== undefined) {
      row.randomize = dto.randomize;
    }
    if (dto.sipTrunkIds !== undefined) {
      await this.assertInboundTrunks(organizationId, dto.sipTrunkIds);
      row.sipTrunkIds = dto.sipTrunkIds;
    }
    if (dto.hidePhoneNumber !== undefined) {
      row.hidePhoneNumber = dto.hidePhoneNumber;
    }
    if (dto.attributes !== undefined) {
      row.attributes = dto.attributes;
    }
    if (dto.metadata !== undefined) {
      row.metadata =
        dto.metadata === null ? null : dto.metadata.trim() || null;
    }
    if (dto.organizationAgentId !== undefined) {
      if (dto.organizationAgentId) {
        await this.organizationAgentsService.getEntityWithTemplate(
          organizationId,
          dto.organizationAgentId,
        );
      }
      row.organizationAgentId = dto.organizationAgentId;
    }
    if (dto.agentName !== undefined) {
      row.agentName =
        dto.agentName === null ? null : dto.agentName.trim() || null;
    }
    if (dto.isActive !== undefined) {
      row.isActive = dto.isActive;
    }

    this.validateRuleFields(row.ruleType, {
      roomPrefix: row.roomPrefix ?? undefined,
      roomName: row.roomName ?? undefined,
    });

    if (
      row.ruleType === SipDispatchRuleType.INDIVIDUAL &&
      !row.roomPrefix?.trim()
    ) {
      row.roomPrefix = 'call-';
    }

    const saved = await this.repo.save(row);
    return toSipDispatchRuleResponse(saved);
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.organizationsService.findById(organizationId);
    const row = await this.requireByIdAndOrg(organizationId, id);
    // Local delete only — do not delete LiveKit dispatch rule by default.
    await this.repo.remove(row);
  }

  async publish(
    organizationId: string,
    id: string,
  ): Promise<SipDispatchRuleResponseDto> {
    await this.organizationsService.findById(organizationId);
    const row = await this.requireByIdAndOrg(organizationId, id);

    if (!row.isActive) {
      throw new BadRequestException(
        `Dispatch rule is inactive: ${row.id}`,
      );
    }
    if (row.livekitDispatchRuleId?.trim()) {
      throw new ConflictException(
        `Dispatch rule already published: ${row.id} (${row.livekitDispatchRuleId})`,
      );
    }

    this.validateRuleFields(row.ruleType, {
      roomPrefix: row.roomPrefix ?? undefined,
      roomName: row.roomName ?? undefined,
    });

    const trunks = await this.sipTrunksService.getEntitiesByIds(
      organizationId,
      row.sipTrunkIds ?? [],
    );
    const livekitTrunkIds = this.resolveLivekitTrunkIds(
      row.sipTrunkIds ?? [],
      trunks,
    );

    const agentName =
      row.agentName?.trim() || this.livekit.getAgentName();
    const agentMetadata = await this.buildAgentJobMetadata(
      organizationId,
      row,
    );

    const created = await this.livekit.createSipDispatchRule({
      name: row.name,
      rule: this.toLivekitRuleSpec(row),
      trunkIds: livekitTrunkIds.length > 0 ? livekitTrunkIds : undefined,
      hidePhoneNumber: row.hidePhoneNumber,
      attributes: row.attributes ?? undefined,
      metadata: row.metadata ?? undefined,
      agentName,
      agentMetadata,
    });

    row.livekitDispatchRuleId = created.sipDispatchRuleId;
    row.publishedAt = new Date();
    const saved = await this.repo.save(row);
    this.logger.log(
      `Published dispatch rule ${saved.id} → LiveKit ${created.sipDispatchRuleId}`,
    );
    return toSipDispatchRuleResponse(saved);
  }

  async publishMany(
    organizationId: string,
    dispatchRuleIds?: string[],
  ): Promise<{
    results: PublishResourceResultDto[];
    published: SipDispatchRuleResponseDto[];
  }> {
    await this.organizationsService.findById(organizationId);

    let candidates: SipDispatchRule[];
    if (dispatchRuleIds && dispatchRuleIds.length > 0) {
      candidates = await this.repo.findByIdsAndOrg(
        organizationId,
        dispatchRuleIds,
      );
    } else {
      candidates = await this.repo.findDraftsByOrganization(organizationId);
    }

    const results: PublishResourceResultDto[] = [];
    const published: SipDispatchRuleResponseDto[] = [];

    if (dispatchRuleIds && dispatchRuleIds.length > 0) {
      const found = new Set(candidates.map((c) => c.id));
      for (const id of dispatchRuleIds) {
        if (!found.has(id)) {
          results.push({
            id,
            outcome: 'failed',
            message: `Dispatch rule not found for org: ${id}`,
          });
        }
      }
    }

    for (const row of candidates) {
      if (row.livekitDispatchRuleId?.trim()) {
        results.push({
          id: row.id,
          outcome: 'skipped',
          message: 'Already published',
          livekitId: row.livekitDispatchRuleId,
        });
        continue;
      }
      try {
        const dto = await this.publish(organizationId, row.id);
        results.push({
          id: row.id,
          outcome: 'published',
          livekitId: dto.livekitDispatchRuleId,
        });
        published.push(dto);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ id: row.id, outcome: 'failed', message });
      }
    }

    return { results, published };
  }

  private toLivekitRuleSpec(row: SipDispatchRule) {
    if (row.ruleType === SipDispatchRuleType.DIRECT) {
      return {
        type: 'direct' as const,
        roomName: row.roomName!.trim(),
        pin: row.pin ?? undefined,
      };
    }
    if (row.ruleType === SipDispatchRuleType.CALLEE) {
      return {
        type: 'callee' as const,
        roomPrefix: row.roomPrefix ?? undefined,
        pin: row.pin ?? undefined,
        randomize: row.randomize,
      };
    }
    return {
      type: 'individual' as const,
      roomPrefix: row.roomPrefix?.trim() || 'call-',
      pin: row.pin ?? undefined,
    };
  }

  private resolveLivekitTrunkIds(
    localIds: string[],
    trunks: SipTrunk[],
  ): string[] {
    if (localIds.length === 0) {
      return [];
    }
    const byId = new Map(trunks.map((t) => [t.id, t]));
    const livekitIds: string[] = [];
    for (const id of localIds) {
      const trunk = byId.get(id);
      if (!trunk) {
        throw new BadRequestException(
          `Dispatch rule references unknown SIP trunk: ${id}`,
        );
      }
      if (trunk.direction !== SipTrunkDirection.INBOUND) {
        throw new BadRequestException(
          `Dispatch rule trunk must be inbound: ${id}`,
        );
      }
      if (!trunk.livekitTrunkId?.trim()) {
        throw new BadRequestException(
          `Inbound trunk not published yet: ${id}. Publish trunks first.`,
        );
      }
      livekitIds.push(trunk.livekitTrunkId.trim());
    }
    return livekitIds;
  }

  private async buildAgentJobMetadata(
    organizationId: string,
    row: SipDispatchRule,
  ): Promise<string | undefined> {
    if (!row.organizationAgentId) {
      // Minimal metadata so the worker still starts with fallbacks.
      return JSON.stringify({
        organizationId,
        direction: 'inbound',
        medium: 'sip',
        agentKey: 'inbound',
        task: DEFAULT_TASK_KEY,
        prompt: { systemPrompt: '' },
        enabledTools: ['endCall'],
      });
    }

    const orgAgent =
      await this.organizationAgentsService.getEntityWithTemplate(
        organizationId,
        row.organizationAgentId,
      );
    const template = orgAgent.agent;
    const taskKey =
      orgAgent.defaultTaskKey && isKnownTaskKey(orgAgent.defaultTaskKey)
        ? orgAgent.defaultTaskKey
        : template.defaultTaskKey && isKnownTaskKey(template.defaultTaskKey)
          ? template.defaultTaskKey
          : DEFAULT_TASK_KEY;
    const enabledTools =
      await this.toolProfilesService.resolveEnabledToolIds(
        orgAgent.toolProfileId,
      );

    return JSON.stringify({
      organizationId,
      organizationAgentId: orgAgent.id,
      agentKey: template.key,
      direction: 'inbound',
      medium: 'sip',
      task: taskKey,
      prompt: {
        systemPrompt: orgAgent.systemPrompt,
        onEnterInstructions: orgAgent.onEnterInstructions ?? null,
        onExitInstructions: orgAgent.onExitInstructions ?? null,
      },
      enabledTools,
      voice: orgAgent.voice,
      model: orgAgent.model,
      temperature: orgAgent.temperature,
    });
  }

  private async assertInboundTrunks(
    organizationId: string,
    sipTrunkIds: string[],
  ): Promise<void> {
    if (sipTrunkIds.length === 0) {
      return;
    }
    const trunks = await this.sipTrunksService.getEntitiesByIds(
      organizationId,
      sipTrunkIds,
    );
    const found = new Set(trunks.map((t) => t.id));
    for (const id of sipTrunkIds) {
      if (!found.has(id)) {
        throw new BadRequestException(
          `SIP trunk not found in organization: ${id}`,
        );
      }
    }
    for (const trunk of trunks) {
      if (trunk.direction !== SipTrunkDirection.INBOUND) {
        throw new BadRequestException(
          `Dispatch rule may only reference inbound trunks: ${trunk.id}`,
        );
      }
    }
  }

  private validateRuleFields(
    ruleType: SipDispatchRuleType,
    fields: { roomPrefix?: string | null; roomName?: string | null },
  ): void {
    if (ruleType === SipDispatchRuleType.DIRECT) {
      if (!fields.roomName?.trim()) {
        throw new BadRequestException(
          'roomName is required for direct dispatch rules',
        );
      }
    }
    // individual defaults roomPrefix to call- at create time
  }

  private async requireByIdAndOrg(
    organizationId: string,
    id: string,
  ): Promise<SipDispatchRule> {
    const row = await this.repo.findByIdAndOrg(organizationId, id);
    if (!row) {
      throw new NotFoundException(
        `Dispatch rule not found: ${id} (org ${organizationId})`,
      );
    }
    return row;
  }
}
