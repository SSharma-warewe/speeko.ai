import { Field, Select, Textarea } from '@call-agent/ui';
import {
  SAVED_SPEECH_MAX_SENTENCES,
  TOOL_WAITING_DELAYS,
  toolWaitingDefault,
  type ToolWaitingMessage,
  type VoiceTaskDefinition,
} from '@call-agent/contracts';
import {
  enableToolWaiting,
  setToolWaitingMessage,
} from '../../lib/tool-waiting';

const labels: Record<string, string> = {
  checkGhlFreeSlots: 'Check available times',
  checkCalendarAvailability: 'Check available times',
  scheduleGhlMeeting: 'Book appointment',
  createCalendarEvent: 'Book appointment',
  upsertGhlContact: 'Save contact details',
  lookupGhlContact: 'Find contact details',
};

export function ToolWaitingEditor({
  definition,
  onChange,
}: {
  definition: VoiceTaskDefinition;
  onChange: (value: VoiceTaskDefinition) => void;
}) {
  const speech = definition.savedSpeech;
  const enabled = speech?.toolWaiting?.enabled ?? false;
  return (
    <section className="ops-panel">
      <div className="ops-panel-head">
        <h2>While tools are working</h2>
      </div>
      <div className="ops-panel-body ops-stack">
        <label className="voice-task-option">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) =>
              onChange(enableToolWaiting(definition, e.target.checked))
            }
          />{' '}
          Enable waiting messages
        </label>
        <p className="ops-muted">
          The worker plays these sentences automatically. Publish this task to
          reuse them across agents. Playback applies to STT–LLM–TTS agents;
          native speech agents retain these settings without playing them. Audio
          preparation follows the agent’s Prepared sentences setting.
        </p>
        {!definition.toolIds.length && (
          <p className="ops-muted">
            Select tools for this task to configure waiting messages.
          </p>
        )}
        {(speech?.sentences.length ?? 0) >= SAVED_SPEECH_MAX_SENTENCES && (
          <p className="ops-muted">
            Saved and waiting speech share the {SAVED_SPEECH_MAX_SENTENCES}
            -sentence limit.
          </p>
        )}
        {definition.toolIds.map((id) => {
          const config = speech?.toolWaiting?.tools[id] ?? { mode: 'off' };
          const unsupported = id === 'endCall' || id === 'transferCall';
          const label = labels[id] ?? id.replace(/([a-z])([A-Z])/g, '$1 $2');
          const sentence =
            config.mode !== 'off'
              ? speech?.sentences.find((s) => s.key === config.sentenceKey)
              : undefined;
          const recommended = toolWaitingDefault(id)?.delayMs ?? 700;
          return (
            <fieldset
              key={id}
              className="voice-task-card"
              disabled={!enabled || unsupported}
            >
              <legend>{label}</legend>
              <Field label="Waiting message">
                <Select
                  aria-label={`${label} waiting message`}
                  value={config.mode}
                  onChange={(e) =>
                    onChange(
                      setToolWaitingMessage(
                        definition,
                        id,
                        e.target.value as ToolWaitingMessage['mode'],
                      ),
                    )
                  }
                >
                  <option value="default">Default</option>
                  <option value="custom">Custom</option>
                  <option value="off">Off</option>
                </Select>
              </Field>
              <Field label="Sentence">
                <Textarea
                  aria-label={`${label} waiting sentence`}
                  rows={2}
                  maxLength={500}
                  disabled={config.mode === 'off'}
                  readOnly={config.mode !== 'custom'}
                  value={sentence?.text ?? ''}
                  onChange={(e) =>
                    onChange(
                      setToolWaitingMessage(definition, id, 'custom', {
                        text: e.target.value,
                      }),
                    )
                  }
                />
              </Field>
              <Field label="Speak after">
                <Select
                  aria-label={`${label} waiting delay`}
                  disabled={config.mode === 'off'}
                  value={config.mode !== 'off' ? config.delayMs : recommended}
                  onChange={(e) =>
                    config.mode !== 'off' &&
                    onChange(
                      setToolWaitingMessage(definition, id, config.mode, {
                        delayMs: Number(e.target.value),
                      }),
                    )
                  }
                >
                  {TOOL_WAITING_DELAYS.map((delay) => (
                    <option key={delay} value={delay}>
                      {delay} ms{delay === recommended ? ' (recommended)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="ops-muted">
                {unsupported
                  ? 'Waiting messages are unavailable for end-call and transfer actions.'
                  : 'Spoken only if the operation is still running and the caller is quiet.'}
              </p>
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}
