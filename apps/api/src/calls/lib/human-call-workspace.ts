import type { HumanCallWorkspace } from '@call-agent/contracts';
import type { HumanCallSession } from '../human-call-session.entity';

/** Never expose journal fingerprints or credentials through call history. */
export function humanCallWorkspace(session: HumanCallSession): HumanCallWorkspace {
  const state = session.workspace ?? {};
  return {
    selectedTools: session.selection?.selectedTools ?? [],
    interest: state.interest ?? null,
    notes: state.notes ?? '',
    revision: state.revision ?? 0,
    updatedAt: state.updatedAt ?? null,
    updatedBy: state.updatedBy ?? null,
    actions: (state.actions ?? []).map(({ fingerprint: _fingerprint, ...action }) => ({
      ...action,
      // A crashed request cannot safely be repeated, even after its lease would expire.
      status: action.status === 'pending' && Date.now() - Date.parse(action.createdAt) > 60_000
        ? 'uncertain' : action.status,
    })),
  };
}
