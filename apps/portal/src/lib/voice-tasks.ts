import type {
  VoiceTaskDefinition,
  VoiceTaskRecord,
  VoiceTaskVersion,
  TestCallResponse,
  Agent,
} from '@call-agent/contracts';
import { adminFetch, userFetch } from './api';

export const voiceTaskScope = (admin = false, orgId?: string) =>
  admin
    ? orgId
      ? `/admin/organizations/${orgId}/voice-tasks`
      : '/admin/voice-tasks'
    : '/users/voice-tasks';
export function voiceTasksClient(admin = false, orgId?: string) {
  const fetch = admin ? adminFetch : userFetch;
  const root = voiceTaskScope(admin, orgId);
  return {
    list: () => fetch<VoiceTaskRecord[]>(root),
    get: (id: string) => fetch<VoiceTaskRecord>(`${root}/${id}`),
    create: (definition: VoiceTaskDefinition) =>
      fetch<VoiceTaskRecord>(root, { method: 'POST', body: { definition } }),
    save: (id: string, revision: number, definition: VoiceTaskDefinition) =>
      fetch<VoiceTaskRecord>(`${root}/${id}/draft`, {
        method: 'PATCH',
        body: { revision, definition },
      }),
    publish: (id: string, revision: number) =>
      fetch<VoiceTaskRecord>(`${root}/${id}/publish`, {
        method: 'POST',
        body: { revision },
      }),
    clone: (id: string) =>
      fetch<VoiceTaskRecord>(`${root}/${id}/clone`, { method: 'POST' }),
    archive: (id: string) =>
      fetch<VoiceTaskRecord>(`${root}/${id}/archive`, { method: 'POST' }),
    history: (id: string) =>
      fetch<VoiceTaskVersion[]>(`${root}/${id}/versions`),
    test: (
      id: string,
      revision: number,
      organizationAgentId: string,
      context: Record<string, unknown>,
      organizationId?: string,
    ) =>
      fetch<TestCallResponse>(`${root}/${id}/test`, {
        method: 'POST',
        body: {
          revision,
          organizationAgentId,
          context,
          ...(organizationId ? { organizationId } : {}),
        },
      }),
  };
}
export const taskSelection = (value: string) =>
  value.startsWith('voice:')
    ? { voiceTaskId: value.slice(6) }
    : value
      ? { task: value }
      : {};
export const defaultTaskSelection = (value: string, direction: string) =>
  value.startsWith('voice:')
    ? { defaultVoiceTaskId: value.slice(6) }
    : {
        defaultVoiceTaskId: null,
        ...(direction === 'inbound'
          ? { defaultTaskKey: value || 'general' }
          : {}),
      };
export const savedTaskSelection = (
  agent: Pick<Agent, 'defaultVoiceTaskId' | 'defaultTaskKey'>,
) =>
  agent.defaultVoiceTaskId
    ? `voice:${agent.defaultVoiceTaskId}`
    : agent.defaultTaskKey || '';
