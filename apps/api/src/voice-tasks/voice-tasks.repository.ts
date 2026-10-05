import { Organization } from '../organizations/organization.entity';
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import type { VoiceTaskDefinition } from '@call-agent/contracts';
import { VoiceTask, VoiceTaskVersionEntity } from './voice-task.entity';

@Injectable()
export class VoiceTasksRepository {
  constructor(
    @InjectRepository(VoiceTask) private readonly tasks: Repository<VoiceTask>,
    @InjectRepository(VoiceTaskVersionEntity)
    private readonly versions: Repository<VoiceTaskVersionEntity>,
    private readonly dataSource: DataSource,
  ) {}
  organizationExists(id: string) {
    return this.dataSource.getRepository(Organization).existsBy({ id });
  }
  list(org: string | null) {
    return this.tasks.find({
      where: org
        ? [{ organizationId: org }, { organizationId: IsNull() }]
        : { organizationId: IsNull() },
      order: { createdAt: 'ASC' },
    });
  }
  find(id: string) {
    return this.tasks.findOneBy({ id });
  }
  version(taskId: string, version: number) {
    return this.versions.findOneBy({ taskId, version });
  }
  history(taskId: string) {
    return this.versions.find({
      where: { taskId },
      order: { version: 'DESC' },
    });
  }
  create(organizationId: string | null, draft: VoiceTaskDefinition) {
    return this.tasks.save(
      this.tasks.create({
        organizationId,
        draft,
        starterKey: null,
        draftRevision: 1,
        publishedVersion: null,
        archived: false,
      }),
    );
  }
  async update(id: string, revision: number, draft: VoiceTaskDefinition) {
    const result = await this.tasks.update(
      { id, draftRevision: revision, archived: false },
      { draft, draftRevision: revision + 1 },
    );
    if (result.affected !== 1)
      throw new ConflictException(
        'Draft changed or was archived. Reload before saving.',
      );
    return this.find(id);
  }
  async publish(id: string, revision: number) {
    return this.dataSource.transaction(async (manager) => {
      const row = await manager.findOne(VoiceTask, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.archived || row.draftRevision !== revision)
        throw new ConflictException(
          'Draft changed or was archived. Reload before publishing.',
        );
      const version = (row.publishedVersion ?? 0) + 1;
      await manager.insert(VoiceTaskVersionEntity, {
        taskId: id,
        version,
        definition: row.draft,
      });
      row.publishedVersion = version;
      await manager.save(row);
      return row;
    });
  }
  async archive(id: string) {
    await this.tasks.update(id, { archived: true });
  }
  async seed(id: string, starterKey: string, draft: VoiceTaskDefinition) {
    await this.dataSource.transaction(async (manager) => {
      // Deterministic ids plus ON CONFLICT let multiple API replicas seed safely.
      const inserted = await manager
        .createQueryBuilder()
        .insert()
        .into(VoiceTask)
        .values({
          id,
          starterKey,
          organizationId: null,
          draft,
          draftRevision: 1,
          publishedVersion: 1,
          archived: false,
        })
        .orIgnore()
        .returning('id')
        .execute();
      if (inserted.raw.length)
        await manager.insert(VoiceTaskVersionEntity, {
          taskId: id,
          version: 1,
          definition: draft,
        });
    });
  }
}
