import { useEffect, useState, type ChangeEventHandler } from 'react';
import { Select } from '@call-agent/ui';
import { KNOWN_TASK_KEYS, type VoiceTaskRecord } from '@call-agent/contracts';
import { voiceTasksClient } from '../../lib/voice-tasks';

export function VoiceTaskSelect({
  value,
  onChange,
  admin = false,
  orgId,
  direction,
  legacy = true,
  disabled,
  id,
  label = 'Task',
  emptyLabel = 'Agent default',
}: {
  value: string;
  onChange: ChangeEventHandler<HTMLSelectElement>;
  admin?: boolean;
  orgId?: string;
  direction?: 'inbound' | 'outbound';
  legacy?: boolean;
  disabled?: boolean;
  id?: string;
  label?: string;
  emptyLabel?: string;
}) {
  const [tasks, setTasks] = useState<VoiceTaskRecord[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    voiceTasksClient(admin, orgId)
      .list()
      .then((rows) => {
        if (active) {
          setTasks(rows);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e.message || 'Could not load tasks');
      });
    return () => {
      active = false;
    };
  }, [admin, orgId]);
  const available = tasks.filter(
    (t) =>
      !t.archived &&
      t.published &&
      (!direction || t.published.definition.directions.includes(direction)),
  );
  const known =
    !value ||
    available.some((t) => `voice:${t.id}` === value) ||
    (legacy && (KNOWN_TASK_KEYS as readonly string[]).includes(value));
  return (
    <>
      <Select
        id={id}
        aria-label={label}
        value={value}
        onChange={onChange}
        disabled={disabled}
      >
        <option value="">{emptyLabel}</option>
        <optgroup label="Published tasks">
          {available.map((t) => (
            <option key={t.id} value={`voice:${t.id}`}>
              {t.published!.definition.name} · v{t.publishedVersion}
            </option>
          ))}
        </optgroup>
        {legacy && (
          <optgroup label="Legacy tasks">
            {KNOWN_TASK_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </optgroup>
        )}
        {!known && (
          <option value={value}>Current selection (unavailable)</option>
        )}
      </Select>
      {error && (
        <p role="alert" className="ops-muted">
          {error}
        </p>
      )}
    </>
  );
}
