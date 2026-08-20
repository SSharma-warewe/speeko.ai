import { Injectable, NotFoundException } from '@nestjs/common';
import { ToolProfilesService } from '../tools/tool-profiles.service';
import { DEFAULT_TASK_KEY } from '../tools/known-tools';
import { Agent, AgentDirection } from './agent.entity';
import { AgentsRepository } from './agents.repository';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { toAgentTemplateResponse } from './mappers/agent-response.mapper';
import { normalizeDeliveryMode, normalizeVoice } from './voice-settings';

export type CreateAgentSeedInput = {
  key: string;
  name: string;
  direction: AgentDirection;
  description: string | null;
  systemPrompt: string;
  defaultTaskKey: string;
  defaultToolProfileId: string | null;
  voice: string | null;
  model: string | null;
  temperature: number | null;
  speakingRate?: number | null;
  deliveryMode?: string | null;
};

/** null = default; "" = skip speech; non-empty = custom. Whitespace-only → null. */
export function normalizeHookInstructions(
  value: string | null,
): string | null {
  if (value === null) return null;
  if (value === '') return '';
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

@Injectable()
export class AgentsService {
  constructor(
    private readonly agentsRepository: AgentsRepository,
    private readonly toolProfilesService: ToolProfilesService,
  ) {}

  findByKey(key: string): Promise<Agent | null> {
    return this.agentsRepository.findByKey(key);
  }

  async findById(id: string): Promise<Agent> {
    const agent = await this.agentsRepository.findById(id);
    if (!agent) {
      throw new NotFoundException(`Agent not found: ${id}`);
    }
    return agent;
  }

  findAll(): Promise<Agent[]> {
    return this.agentsRepository.findAllOrderedByKey();
  }

  async createIfMissing(input: CreateAgentSeedInput): Promise<Agent> {
    const existing = await this.findByKey(input.key);
    if (existing) {
      // Keep persona seeds from drifting forever; only fill missing capability links.
      let dirty = false;
      if (!existing.defaultToolProfileId && input.defaultToolProfileId) {
        existing.defaultToolProfileId = input.defaultToolProfileId;
        dirty = true;
      }
      if (!existing.defaultTaskKey) {
        existing.defaultTaskKey = input.defaultTaskKey || DEFAULT_TASK_KEY;
        dirty = true;
      }
      if (dirty) {
        return this.agentsRepository.save(existing);
      }
      return existing;
    }
    const agent = this.agentsRepository.create({
      key: input.key,
      name: input.name,
      direction: input.direction,
      description: input.description,
      systemPrompt: input.systemPrompt,
      defaultTaskKey: input.defaultTaskKey || DEFAULT_TASK_KEY,
      defaultToolProfileId: input.defaultToolProfileId,
      voice: input.voice,
      model: input.model,
      temperature: input.temperature,
      speakingRate: input.speakingRate ?? null,
      deliveryMode: input.deliveryMode ?? null,
      isActive: true,
    });
    return this.agentsRepository.save(agent);
  }

  async update(id: string, dto: UpdateAgentDto) {
    const agent = await this.findById(id);
    if (dto.systemPrompt !== undefined) {
      agent.systemPrompt = dto.systemPrompt;
    }
    if (dto.onEnterInstructions !== undefined) {
      agent.onEnterInstructions = normalizeHookInstructions(
        dto.onEnterInstructions,
      );
    }
    if (dto.onExitInstructions !== undefined) {
      agent.onExitInstructions = normalizeHookInstructions(
        dto.onExitInstructions,
      );
    }
    if (dto.defaultTaskKey !== undefined) {
      agent.defaultTaskKey = dto.defaultTaskKey;
    }
    if (dto.defaultToolProfileId !== undefined) {
      await this.toolProfilesService.findById(dto.defaultToolProfileId);
      agent.defaultToolProfileId = dto.defaultToolProfileId;
    }
    if (dto.voice !== undefined) {
      agent.voice = normalizeVoice(dto.voice);
    }
    if (dto.model !== undefined) {
      agent.model = dto.model;
    }
    if (dto.temperature !== undefined) {
      agent.temperature = dto.temperature;
    }
    if (dto.speakingRate !== undefined) {
      agent.speakingRate = dto.speakingRate;
    }
    if (dto.deliveryMode !== undefined) {
      agent.deliveryMode = normalizeDeliveryMode(dto.deliveryMode);
    }
    if (dto.isActive !== undefined) {
      agent.isActive = dto.isActive;
    }
    const saved = await this.agentsRepository.save(agent);
    const tools = await this.toolProfilesService.resolveEnabledToolIds(
      saved.defaultToolProfileId,
    );
    return toAgentTemplateResponse(saved, tools);
  }

  async listTemplates() {
    const rows = await this.findAll();
    return Promise.all(
      rows.map(async (row) => {
        const tools = await this.toolProfilesService.resolveEnabledToolIds(
          row.defaultToolProfileId,
        );
        return toAgentTemplateResponse(row, tools);
      }),
    );
  }

  async getTemplate(id: string) {
    const agent = await this.findById(id);
    const tools = await this.toolProfilesService.resolveEnabledToolIds(
      agent.defaultToolProfileId,
    );
    return toAgentTemplateResponse(agent, tools);
  }
}
