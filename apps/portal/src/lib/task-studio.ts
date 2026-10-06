import type {
  VoiceTaskDefinition,
  VoiceTaskRecord,
  VoiceTaskVersion,
  VoiceTaskCheck,
  WhatsAppTaskCheck,
  WhatsAppTaskDefinition,
  WhatsAppTaskRecord,
  WhatsAppTaskVersion,
  WhatsAppAgentToolId,
} from '@call-agent/contracts';
import { voiceTasksClient } from './voice-tasks';
import { adminFetch, userFetch } from './api';

export type TaskEditorDefinition = Omit<VoiceTaskDefinition, 'outcomes'> & {
  outcomes: Array<
    Omit<VoiceTaskDefinition['outcomes'][number], 'checks'> & {
      checks: Array<VoiceTaskCheck | WhatsAppTaskCheck>;
      terminalStatus?: 'completed' | 'cancelled';
    }
  >;
};
export type TaskEditorSnapshot = Omit<
  VoiceTaskVersion,
  'definition' | 'publishedAt'
> & { definition: TaskEditorDefinition };
export type TaskEditorRecord = Omit<VoiceTaskRecord, 'draft' | 'published'> & {
  draft: TaskEditorDefinition;
  published: TaskEditorSnapshot | null;
};
export type TaskEditorVersion = TaskEditorSnapshot & { publishedAt: string };
export function whatsappDefinition(
  d: TaskEditorDefinition,
): WhatsAppTaskDefinition {
  const { directions: _, ...rest } = d;
  return {
    ...rest,
    toolIds: d.toolIds as WhatsAppAgentToolId[],
    phases: d.phases.map((p) => ({
      ...p,
      toolIds: p.toolIds as WhatsAppAgentToolId[],
    })),
    outcomes: d.outcomes.map((o) => ({
      ...o,
      checks: o.checks as WhatsAppTaskCheck[],
      terminalStatus: o.terminalStatus ?? 'completed',
    })),
  };
}
export function voiceDefinition(d: TaskEditorDefinition): VoiceTaskDefinition {
  return {
    ...d,
    outcomes: d.outcomes.map(({ terminalStatus: _, ...o }) => ({
      ...o,
      checks: o.checks as VoiceTaskCheck[],
    })),
  };
}
const editorDefinition = (d: WhatsAppTaskDefinition): TaskEditorDefinition => ({
  ...d,
  directions: ['inbound'],
});
const editorRecord = (r: WhatsAppTaskRecord): TaskEditorRecord => ({
  ...r,
  draft: editorDefinition(r.draft),
  published: r.published
    ? { ...r.published, definition: editorDefinition(r.published.definition) }
    : null,
});
export const whatsappTaskScope = (admin = false, orgId?: string) =>
  admin
    ? orgId
      ? `/admin/organizations/${orgId}/whatsapp-tasks`
      : '/admin/whatsapp-tasks'
    : '/users/whatsapp-tasks';
export function whatsappTasksClient(admin = false, orgId?: string) {
  const fetch = admin ? adminFetch : userFetch;
  const root = whatsappTaskScope(admin, orgId);
  return {
    list: () => fetch<WhatsAppTaskRecord[]>(root),
    get: (id: string) => fetch<WhatsAppTaskRecord>(`${root}/${id}`),
    create: (definition: WhatsAppTaskDefinition) =>
      fetch<WhatsAppTaskRecord>(root, { method: 'POST', body: { definition } }),
    save: (id: string, revision: number, definition: WhatsAppTaskDefinition) =>
      fetch<WhatsAppTaskRecord>(`${root}/${id}/draft`, {
        method: 'PATCH',
        body: { revision, definition },
      }),
    publish: (id: string, revision: number) =>
      fetch<WhatsAppTaskRecord>(`${root}/${id}/publish`, {
        method: 'POST',
        body: { revision },
      }),
    clone: (id: string) =>
      fetch<WhatsAppTaskRecord>(`${root}/${id}/clone`, { method: 'POST' }),
    archive: (id: string) =>
      fetch<WhatsAppTaskRecord>(`${root}/${id}/archive`, { method: 'POST' }),
    history: (id: string) =>
      fetch<WhatsAppTaskVersion[]>(`${root}/${id}/versions`),
  };
}
export function taskStudioClient(
  channel: 'voice' | 'whatsapp',
  admin: boolean,
  orgId?: string,
) {
  const voice = voiceTasksClient(admin, orgId);
  const wa = whatsappTasksClient(admin, orgId);
  return {
    list: async (): Promise<TaskEditorRecord[]> =>
      channel === 'voice' ? voice.list() : (await wa.list()).map(editorRecord),
    get: async (id: string): Promise<TaskEditorRecord> =>
      channel === 'voice' ? voice.get(id) : editorRecord(await wa.get(id)),
    create: async (d: TaskEditorDefinition): Promise<TaskEditorRecord> =>
      channel === 'voice'
        ? voice.create(voiceDefinition(d))
        : editorRecord(await wa.create(whatsappDefinition(d))),
    save: async (
      id: string,
      revision: number,
      d: TaskEditorDefinition,
    ): Promise<TaskEditorRecord> =>
      channel === 'voice'
        ? voice.save(id, revision, voiceDefinition(d))
        : editorRecord(await wa.save(id, revision, whatsappDefinition(d))),
    publish: async (id: string, revision: number): Promise<TaskEditorRecord> =>
      channel === 'voice'
        ? voice.publish(id, revision)
        : editorRecord(await wa.publish(id, revision)),
    clone: async (id: string): Promise<TaskEditorRecord> =>
      channel === 'voice' ? voice.clone(id) : editorRecord(await wa.clone(id)),
    archive: async (id: string): Promise<TaskEditorRecord> =>
      channel === 'voice'
        ? voice.archive(id)
        : editorRecord(await wa.archive(id)),
    history: async (id: string): Promise<TaskEditorVersion[]> =>
      channel === 'voice'
        ? voice.history(id)
        : (await wa.history(id)).map((v) => ({
            ...v,
            definition: editorDefinition(v.definition),
          })),
    test: voice.test,
  };
}
