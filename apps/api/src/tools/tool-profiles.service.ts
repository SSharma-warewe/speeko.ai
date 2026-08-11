import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isKnownToolId, KNOWN_TOOL_IDS } from './known-tools';
import { CreateToolProfileDto } from './dto/create-tool-profile.dto';
import { UpdateToolProfileDto } from './dto/update-tool-profile.dto';
import { ToolProfile } from './tool-profile.entity';
import { ToolProfilesRepository } from './tool-profiles.repository';

export type ToolProfileResponse = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  organizationId: string | null;
  isPlatform: boolean;
  toolIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ToolProfilesService {
  constructor(private readonly repo: ToolProfilesRepository) {}

  async findById(id: string): Promise<ToolProfile> {
    const row = await this.repo.findById(id);
    if (!row) {
      throw new NotFoundException(`Tool profile not found: ${id}`);
    }
    return row;
  }

  async findByKey(key: string): Promise<ToolProfile | null> {
    return this.repo.findByKey(key);
  }

  async requireByKey(key: string): Promise<ToolProfile> {
    const row = await this.repo.findByKey(key);
    if (!row) {
      throw new NotFoundException(`Tool profile not found for key: ${key}`);
    }
    return row;
  }

  list(): Promise<ToolProfile[]> {
    return this.repo.findAll();
  }

  listPlatformResponses(): Promise<ToolProfileResponse[]> {
    return this.repo
      .findPlatform()
      .then((rows) => rows.map(toToolProfileResponse));
  }

  listResponses(): Promise<ToolProfileResponse[]> {
    return this.list().then((rows) => rows.map(toToolProfileResponse));
  }

  listForOrganization(organizationId: string): Promise<ToolProfileResponse[]> {
    return this.repo
      .findVisibleToOrganization(organizationId)
      .then((rows) => rows.map(toToolProfileResponse));
  }

  async getResponse(id: string): Promise<ToolProfileResponse> {
    return toToolProfileResponse(await this.findById(id));
  }

  async getResponseForOrganization(
    organizationId: string,
    id: string,
  ): Promise<ToolProfileResponse> {
    const row = await this.findById(id);
    if (row.organizationId && row.organizationId !== organizationId) {
      throw new NotFoundException(`Tool profile not found: ${id}`);
    }
    return toToolProfileResponse(row);
  }

  /** Resolve enabled tool ids for a profile (empty if profile missing). */
  async resolveEnabledToolIds(
    profileId: string | null | undefined,
  ): Promise<string[]> {
    if (!profileId) {
      return ['endCall'];
    }
    const ids = await this.repo.listToolIds(profileId);
    return ids.length > 0 ? ids : ['endCall'];
  }

  knownToolIds(): string[] {
    return [...KNOWN_TOOL_IDS];
  }

  async createForOrganization(
    organizationId: string,
    dto: CreateToolProfileDto,
  ): Promise<ToolProfileResponse> {
    return this.createProfile(dto, organizationId);
  }

  /** Platform catalog profile (organization_id null). Admin-only. */
  async createForPlatform(
    dto: CreateToolProfileDto,
  ): Promise<ToolProfileResponse> {
    return this.createProfile(dto, null);
  }

  async updateForOrganization(
    organizationId: string,
    id: string,
    dto: UpdateToolProfileDto,
  ): Promise<ToolProfileResponse> {
    const row = await this.requireOrgOwned(organizationId, id);
    return this.applyUpdate(row, dto);
  }

  /** Update a platform catalog profile. Admin-only. */
  async updateForPlatform(
    id: string,
    dto: UpdateToolProfileDto,
  ): Promise<ToolProfileResponse> {
    const row = await this.requirePlatform(id);
    return this.applyUpdate(row, dto);
  }

  async removeForOrganization(
    organizationId: string,
    id: string,
  ): Promise<void> {
    const row = await this.requireOrgOwned(organizationId, id);
    await this.removeIfUnused(row);
  }

  /** Delete a platform catalog profile. Admin-only. Seeded keys may be deleted if unused. */
  async removeForPlatform(id: string): Promise<void> {
    const row = await this.requirePlatform(id);
    await this.removeIfUnused(row);
  }

  private async createProfile(
    dto: CreateToolProfileDto,
    organizationId: string | null,
  ): Promise<ToolProfileResponse> {
    const toolIds = normalizeToolIds(dto.toolIds);
    const key = dto.key?.trim() || slugifyKey(dto.name);
    if (!key) {
      throw new BadRequestException('Could not derive a valid key from name');
    }

    if (organizationId) {
      const existing = await this.repo.findByOrgAndKey(organizationId, key);
      if (existing) {
        throw new ConflictException(
          `Tool profile key already exists for this organization: ${key}`,
        );
      }
    } else {
      const existing = await this.repo.findByKey(key);
      if (existing) {
        throw new ConflictException(
          `Platform tool profile key already exists: ${key}`,
        );
      }
    }

    let profile = this.repo.createProfile({
      key,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      organizationId,
    });
    profile = await this.repo.saveProfile(profile);
    await this.repo.replaceTools(profile.id, toolIds);
    return this.getResponse(profile.id);
  }

  private async applyUpdate(
    row: ToolProfile,
    dto: UpdateToolProfileDto,
  ): Promise<ToolProfileResponse> {
    if (dto.name !== undefined) {
      row.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      row.description = dto.description?.trim() || null;
    }
    await this.repo.saveProfile(row);

    if (dto.toolIds !== undefined) {
      const toolIds = normalizeToolIds(dto.toolIds);
      await this.repo.replaceTools(row.id, toolIds);
    }

    return this.getResponse(row.id);
  }

  private async removeIfUnused(row: ToolProfile): Promise<void> {
    const inUse = await this.repo.countOrgAgentsUsingProfile(row.id);
    if (inUse > 0) {
      throw new ConflictException(
        `Cannot delete tool profile: ${inUse} organization agent(s) still use it`,
      );
    }
    // Also block if platform agent templates still point at this profile.
    const templateCount = await this.repo.countAgentTemplatesUsingProfile(
      row.id,
    );
    if (templateCount > 0) {
      throw new ConflictException(
        `Cannot delete tool profile: ${templateCount} platform agent template(s) still use it as default`,
      );
    }
    await this.repo.removeProfile(row);
  }

  async ensureProfile(input: {
    key: string;
    name: string;
    description?: string | null;
    toolIds: string[];
  }): Promise<ToolProfile> {
    let profile = await this.repo.findByKey(input.key);
    if (!profile) {
      profile = this.repo.createProfile({
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        organizationId: null,
      });
      profile = await this.repo.saveProfile(profile);
    }

    const existing = new Set((profile.tools ?? []).map((t) => t.toolId));
    for (const toolId of input.toolIds) {
      if (existing.has(toolId)) {
        continue;
      }
      const row = this.repo.createTool({
        profileId: profile.id,
        toolId,
      });
      await this.repo.saveTool(row);
      existing.add(toolId);
    }

    const reloaded = await this.repo.findByKey(input.key);
    return reloaded!;
  }

  private async requireOrgOwned(
    organizationId: string,
    id: string,
  ): Promise<ToolProfile> {
    const row = await this.findById(id);
    if (!row.organizationId) {
      throw new ForbiddenException(
        'Platform tool profiles cannot be modified by organization users',
      );
    }
    if (row.organizationId !== organizationId) {
      throw new NotFoundException(`Tool profile not found: ${id}`);
    }
    return row;
  }

  private async requirePlatform(id: string): Promise<ToolProfile> {
    const row = await this.findById(id);
    if (row.organizationId) {
      throw new ForbiddenException(
        'Use organization-scoped endpoints for org-owned tool profiles',
      );
    }
    return row;
  }
}

export function toToolProfileResponse(row: ToolProfile): ToolProfileResponse {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    organizationId: row.organizationId ?? null,
    isPlatform: !row.organizationId,
    toolIds: (row.tools ?? []).map((t) => t.toolId).sort(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Keep only known ids, force endCall, de-dupe, sort. */
export function normalizeToolIds(raw: string[]): string[] {
  const unknown = raw.filter((id) => !isKnownToolId(id));
  if (unknown.length > 0) {
    throw new BadRequestException(
      `Unknown tool id(s): ${unknown.join(', ')}. Known: ${KNOWN_TOOL_IDS.join(', ')}`,
    );
  }
  const set = new Set(raw.filter(isKnownToolId));
  set.add('endCall');
  return [...set].sort();
}

export function slugifyKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
