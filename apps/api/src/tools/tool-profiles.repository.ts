import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, IsNull, Repository } from 'typeorm';
import { ToolProfile } from './tool-profile.entity';
import { ToolProfileTool } from './tool-profile-tool.entity';

@Injectable()
export class ToolProfilesRepository {
  constructor(
    @InjectRepository(ToolProfile)
    private readonly profiles: Repository<ToolProfile>,
    @InjectRepository(ToolProfileTool)
    private readonly profileTools: Repository<ToolProfileTool>,
  ) {}

  findById(id: string): Promise<ToolProfile | null> {
    return this.profiles.findOne({
      where: { id },
      relations: { tools: true },
    });
  }

  findByKey(key: string): Promise<ToolProfile | null> {
    return this.profiles.findOne({
      where: { key, organizationId: IsNull() },
      relations: { tools: true },
    });
  }

  findByOrgAndKey(
    organizationId: string,
    key: string,
  ): Promise<ToolProfile | null> {
    return this.profiles.findOne({
      where: { organizationId, key },
      relations: { tools: true },
    });
  }

  findAll(): Promise<ToolProfile[]> {
    return this.profiles.find({
      relations: { tools: true },
      order: { key: 'ASC' },
    });
  }

  /** Platform seeds (organization_id IS NULL) only. */
  findPlatform(): Promise<ToolProfile[]> {
    return this.profiles.find({
      where: { organizationId: IsNull() },
      relations: { tools: true },
      order: { key: 'ASC' },
    });
  }

  findByOrganization(organizationId: string): Promise<ToolProfile[]> {
    return this.profiles.find({
      where: { organizationId },
      relations: { tools: true },
      order: { key: 'ASC' },
    });
  }

  /**
   * Profiles visible to an org: platform catalog + org-owned customs.
   */
  async findVisibleToOrganization(
    organizationId: string,
  ): Promise<ToolProfile[]> {
    const [platform, orgOwned] = await Promise.all([
      this.findPlatform(),
      this.findByOrganization(organizationId),
    ]);
    return [...platform, ...orgOwned].sort((a, b) =>
      a.key.localeCompare(b.key),
    );
  }

  createProfile(data: DeepPartial<ToolProfile>): ToolProfile {
    return this.profiles.create(data);
  }

  saveProfile(row: ToolProfile): Promise<ToolProfile> {
    return this.profiles.save(row);
  }

  async removeProfile(row: ToolProfile): Promise<void> {
    await this.profiles.remove(row);
  }

  createTool(data: DeepPartial<ToolProfileTool>): ToolProfileTool {
    return this.profileTools.create(data);
  }

  saveTool(row: ToolProfileTool): Promise<ToolProfileTool> {
    return this.profileTools.save(row);
  }

  async replaceTools(profileId: string, toolIds: string[]): Promise<void> {
    await this.profileTools.delete({ profileId });
    for (const toolId of toolIds) {
      const row = this.profileTools.create({ profileId, toolId });
      await this.profileTools.save(row);
    }
  }

  async listToolIds(profileId: string): Promise<string[]> {
    const rows = await this.profileTools.find({
      where: { profileId },
      order: { toolId: 'ASC' },
    });
    return rows.map((r) => r.toolId);
  }

  async countOrgAgentsUsingProfile(profileId: string): Promise<number> {
    // Avoid circular entity import in tools module — raw query via profiles manager.
    const result: Array<{ cnt: string }> = await this.profiles.manager.query(
      `SELECT COUNT(*)::text AS cnt FROM organization_agents WHERE tool_profile_id = $1`,
      [profileId],
    );
    return Number(result[0]?.cnt ?? 0);
  }

  async countAgentTemplatesUsingProfile(profileId: string): Promise<number> {
    const result: Array<{ cnt: string }> = await this.profiles.manager.query(
      `SELECT COUNT(*)::text AS cnt FROM agents WHERE default_tool_profile_id = $1`,
      [profileId],
    );
    return Number(result[0]?.cnt ?? 0);
  }
}
