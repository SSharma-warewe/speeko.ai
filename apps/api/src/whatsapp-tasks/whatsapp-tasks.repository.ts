import { Organization } from '../organizations/organization.entity';
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import type { WhatsAppTaskDefinition } from '@call-agent/contracts';
import {
  WhatsAppTask,
  WhatsAppTaskVersionEntity,
} from './whatsapp-task.entity';

@Injectable()
export class WhatsAppTasksRepository {
  constructor(
    @InjectRepository(WhatsAppTask)
    private readonly tasks: Repository<WhatsAppTask>,
    @InjectRepository(WhatsAppTaskVersionEntity)
    private readonly versions: Repository<WhatsAppTaskVersionEntity>,
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
  create(organizationId: string | null, draft: WhatsAppTaskDefinition) {
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
  async update(id: string, revision: number, draft: WhatsAppTaskDefinition) {
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
      const row = await manager.findOne(WhatsAppTask, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.archived || row.draftRevision !== revision)
        throw new ConflictException(
          'Draft changed or was archived. Reload before publishing.',
        );
      const version = (row.publishedVersion ?? 0) + 1;
      await manager.insert(WhatsAppTaskVersionEntity, {
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
  async seed(id: string, starterKey: string, draft: WhatsAppTaskDefinition) {
    await this.dataSource.transaction(async (manager) => {
      // Deterministic ids plus ON CONFLICT let multiple API replicas seed safely.
      const inserted = await manager
        .createQueryBuilder()
        .insert()
        .into(WhatsAppTask)
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
        await manager.insert(WhatsAppTaskVersionEntity, {
          taskId: id,
          version: 1,
          definition: draft,
        });
    });
  }
}
