import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  compileVoiceTaskInstructions,
  isVoiceTaskSnapshot,
  VOICE_TASK_STARTERS,
  voiceTaskDefinitionErrors,
  voiceTaskFieldAccepts,
  type VoiceTaskDefinition,
  type VoiceTaskRecord,
  type VoiceTaskSnapshot,
} from '@call-agent/contracts';
import { VoiceTasksRepository } from './voice-tasks.repository';
import { VoiceTask } from './voice-task.entity';

@Injectable()
export class VoiceTasksService implements OnModuleInit {
  constructor(private readonly repository: VoiceTasksRepository) {}
  async onModuleInit() {
    for (const [key, definition] of Object.entries(VOICE_TASK_STARTERS)) {
      const hex = createHash('sha256')
        .update(`speeko:voice-task:${key}`)
        .digest('hex');
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      await this.repository.seed(id, key, definition);
    }
  }
  validate(definition: unknown): asserts definition is VoiceTaskDefinition {
    const errors = voiceTaskDefinitionErrors(definition);
    if (errors.length) throw new BadRequestException(errors);
  }
  async readable(org: string | null, id: string): Promise<VoiceTask> {
    const row = await this.repository.find(id);
    if (!row || (row.organizationId !== org && row.organizationId !== null))
      throw new NotFoundException('Voice task not found');
    if (org && row.organizationId === null && !row.publishedVersion)
      throw new NotFoundException('Voice task not found');
    return row;
  }
  async owned(org: string | null, id: string) {
    const row = await this.readable(org, id);
    if (row.organizationId !== org)
      throw new NotFoundException('Voice task not found');
    return row;
  }
  async response(
    row: VoiceTask,
    viewerOrg: string | null,
  ): Promise<VoiceTaskRecord> {
    const published = row.publishedVersion
      ? await this.snapshot(
          row.organizationId,
          row.id,
          row.publishedVersion,
          true,
        )
      : null;
    return {
      id: row.id,
      organizationId: row.organizationId,
      starterKey: row.starterKey,
      draftRevision: row.draftRevision,
      publishedVersion: row.publishedVersion,
      archived: row.archived,
      draft:
        viewerOrg !== row.organizationId ? published!.definition : row.draft,
      published,
    };
  }
  private async assertOrganization(org: string | null) {
    if (org && !(await this.repository.organizationExists(org)))
      throw new NotFoundException('Organization not found');
  }
  async list(org: string | null) {
    await this.assertOrganization(org);
    return Promise.all(
      (await this.repository.list(org))
        .filter(
          (r) =>
            !org ||
            r.organizationId === org ||
            (!!r.publishedVersion && !r.archived),
        )
        .map((r) => this.response(r, org)),
    );
  }
  async get(org: string | null, id: string) {
    return this.response(await this.readable(org, id), org);
  }
  async create(org: string | null, definition: unknown) {
    await this.assertOrganization(org);
    this.validate(definition);
    return this.response(await this.repository.create(org, definition), org);
  }
  async update(
    org: string | null,
    id: string,
    revision: number,
    definition: unknown,
  ) {
    await this.owned(org, id);
    this.validate(definition);
    await this.repository.update(id, revision, definition);
    return this.get(org, id);
  }
  async publish(org: string | null, id: string, revision: number) {
    const row = await this.owned(org, id);
    this.validate(row.draft);
    return this.response(await this.repository.publish(id, revision), org);
  }
  async clone(org: string | null, id: string) {
    const row = await this.readable(org, id);
    const source =
      row.organizationId === org
        ? row.draft
        : (await this.snapshot(org, id)).definition;
    return this.create(org, {
      ...source,
      name: `${source.name.slice(0, 110)} copy`,
    });
  }
  async archive(org: string | null, id: string) {
    await this.owned(org, id);
    await this.repository.archive(id);
    return this.get(org, id);
  }
  async history(org: string | null, id: string) {
    await this.readable(org, id);
    return (await this.repository.history(id)).map((v) => ({
      schemaVersion: 1 as const,
      taskId: id,
      version: v.version,
      definition: v.definition,
      publishedAt: v.publishedAt.toISOString(),
    }));
  }
  async draftSnapshot(
    org: string | null,
    id: string,
    revision: number,
  ): Promise<VoiceTaskSnapshot> {
    const row = await this.owned(org, id);
    if (row.archived || row.draftRevision !== revision)
      throw new ConflictException(
        'Draft changed or archived. Reload before testing.',
      );
    this.validate(row.draft);
    return {
      schemaVersion: 1,
      taskId: id,
      version: 0,
      draftRevision: revision,
      definition: row.draft,
    };
  }
  async preview(org: string | null, id: string, revision: number) {
    const snapshot = await this.draftSnapshot(org, id, revision);
    return {
      snapshot,
      instructions: compileVoiceTaskInstructions(snapshot.definition),
      resultFields: snapshot.definition.resultFields,
      outcomes: snapshot.definition.outcomes,
    };
  }
  async snapshot(
    org: string | null,
    id: string,
    version?: number,
    historical = false,
  ): Promise<VoiceTaskSnapshot> {
    const row = await this.readable(org, id);
    if ((!historical && row.archived) || !row.publishedVersion)
      throw new BadRequestException('Task must be published and active');
    const entry = await this.repository.version(
      id,
      version ?? row.publishedVersion,
    );
    if (!entry) throw new NotFoundException('Task version not found');
    this.validate(entry.definition);
    return {
      schemaVersion: 1,
      taskId: id,
      version: entry.version,
      definition: entry.definition,
    };
  }
  async resolve(
    org: string | null,
    requested: { task?: string | null; voiceTaskId?: string | null },
    agent: {
      defaultVoiceTaskId?: string | null;
      defaultTaskKey?: string | null;
    },
    template: { defaultVoiceTaskId?: string | null } = {},
  ) {
    if (requested.task && requested.voiceTaskId)
      throw new BadRequestException('Choose task or voiceTaskId, not both');
    if (requested.task) return null;
    if (
      !requested.voiceTaskId &&
      !agent.defaultVoiceTaskId &&
      agent.defaultTaskKey
    )
      return null;
    const id =
      requested.voiceTaskId ??
      agent.defaultVoiceTaskId ??
      template.defaultVoiceTaskId;
    return id ? this.snapshot(org, id) : null;
  }
  prepare(
    snapshot: VoiceTaskSnapshot,
    direction: string,
    enabledTools: string[],
    context: Record<string, unknown> = {},
    calendarProvider?: string | null,
    validateContext = true,
  ) {
    if (!isVoiceTaskSnapshot(snapshot))
      throw new BadRequestException(
        'Invalid or unsupported voice task snapshot',
      );
    const d = snapshot.definition;
    if (!d.directions.includes(direction as 'inbound' | 'outbound'))
      throw new BadRequestException(
        'Task does not support this call direction',
      );
    const missing = d.toolIds.filter(
      (t) => t !== 'endCall' && !enabledTools.includes(t),
    );
    if (missing.length)
      throw new BadRequestException(
        `Task requires unassigned capabilities: ${missing.join(', ')}`,
      );
    const needsGhl = d.toolIds.some((t) =>
      [
        'scheduleGhlMeeting',
        'checkGhlFreeSlots',
        'lookupGhlContact',
        'upsertGhlContact',
      ].includes(t),
    );
    const needsNylas = d.toolIds.some((t) =>
      [
        'createCalendarEvent',
        'checkCalendarAvailability',
        'listCalendarEvents',
        'cancelCalendarEvent',
      ].includes(t),
    );
    if (
      (needsGhl && calendarProvider !== 'ghl') ||
      (needsNylas && calendarProvider !== 'nylas')
    )
      throw new BadRequestException(
        'Task calendar tools require a compatible linked calendar',
      );
    const merged = { ...context };
    for (const field of validateContext ? d.contextFields : []) {
      if (merged[field.key] == null && field.defaultValue !== undefined)
        merged[field.key] = field.defaultValue;
      if (merged[field.key] == null) {
        if (field.required)
          throw new BadRequestException(`Missing context field: ${field.key}`);
      } else if (!voiceTaskFieldAccepts(field, merged[field.key]))
        throw new BadRequestException(`Invalid context field: ${field.key}`);
    }
    return {
      context: merged,
      enabledTools: [...new Set(['endCall', ...d.toolIds])],
    };
  }
}
